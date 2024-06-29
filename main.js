// final project

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { FontLoader } from 'three/addons/loaders/FontLoader.js';
// import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';


const models = {
	0: 'retro_cartoon_car2.glb',
	3: 'lowpoly_ramen_bowl2.glb',
	4: 'choco_bunny2.glb',
	6: 'cut_fish2.glb',
	7: 'RobotExpressive.glb',
	// 7: 'shiba2.glb',
	8: 'laptop.glb',
	11: 'low-poly_truck_car_drifter2.glb',

	// 7: 'gru_gru.glb',
	// 3: 'lowpoly_fox.glb',
};

// webcam connection using WebRTC
window.onload = function () {
	const video = document.getElementById("myvideo");
	video.onloadedmetadata = start_processing;
	const constraints = { audio: false, video: true };
	navigator.mediaDevices.getUserMedia(constraints)
		.then((stream) => video.srcObject = stream)
		.catch((err) => {
			alert(err.name + ": " + err.message);
			// video.src = "marker.webm";
		});
}

const clock = new THREE.Clock();
let containers = {};
let unloadable_models = {};

const loader = new GLTFLoader();
let objects = {};
const getModel = async (id) => {
	const obj = objects[id];
	if (obj == 'loading')
		return null;

	if (obj) return obj; // loaded

	if (!models[id]) {
		// Unknown model
		if (unloadable_models[id] != true) {
			unloadable_models[id] = true;
			console.log('Cannot load model for marker %s', id);
		}
		return null;
	}

	const path = 'models/' + (models[id]);
	console.log('loading model id %s from %s', id, path);
	objects[id] = 'loading';
	return new Promise((resolve, reject) => {
		loader.load(path, model => {
			objects[id] = model;
			resolve(model);
		});
	})
}

const get_container = async (id) => {
	let c = containers[id];
	if (c) {
		c.lastdetectiontime = performance.now();
		c.first_detection = false;
		return c;
	}

	let model = await getModel(id);
	if (!model) {
		return null;
	}

	const container = new THREE.Object3D();
	container.matrixAutoUpdate = false;
	container.add(model.scene);

	const light = new THREE.AmbientLight(0xffffff, 5);
	container.add(light);
	// const axesHelper = new THREE.AxesHelper(1);
	// container.add(axesHelper);

	let k = { container: container, lastdetectiontime: performance.now(), first_detection: true };

	const animations = model.animations;
	if (animations.length > 0) {
		// debugger
		animations.forEach(a => console.log('Animation: ', a.name));
		const clip = animations[0];
		let mixer = new THREE.AnimationMixer(model.scene);
		const action = mixer.clipAction(clip);
		action.play();
		// activateAction( action );		
		k.mixer = mixer;
	}


	containers[id] = k;
	return k;
};

// fix the marker matrix to compensate Y-up models
function fixMatrix(three_mat, m) {
	three_mat.set(
		m[0], m[8], -m[4], m[12],
		m[1], m[9], -m[5], m[13],
		m[2], m[10], -m[6], m[14],
		m[3], m[11], -m[7], m[15]
	);
}

let arController = null;
let video = null;
let camera = null;
let scene = null;
let renderer = null;

// render loop
function renderloop() {

	if(!arController || !renderer || !video || !scene)
		return;

	arController.process(video);

	const clock_delta = clock.getDelta();
	const now = performance.now();

	let ixs = Object.keys(containers);
	for (let i = 0; i < ixs.length; i++) {
		const k = ixs[i];
		let c = containers[k];
		if (now - c.lastdetectiontime < 100) {
			c.container.visible = true;
			if (c.mixer)
				c.mixer.update(clock_delta);
		}
		else
			c.container.visible = false;
	}

	renderer.render(scene, camera);
}

function start_processing() {
	// canvas & video
	video = document.getElementById("myvideo");
	const canvas = document.getElementById("mycanvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	video.width = video.height = 0;

	// three.js
	renderer = new THREE.WebGLRenderer({ canvas: canvas });
	scene = new THREE.Scene();
	camera = new THREE.Camera();
	scene.add(camera);

	// background
	const bgtexture = new THREE.VideoTexture(video);
	bgtexture.colorSpace = THREE.SRGBColorSpace;
	scene.background = bgtexture;

	// jsartoolkit
	arController = new ARController(video, 'camera_para.dat');
	arController.onload = () => {
		console.log('arController loaded');
		camera.projectionMatrix.fromArray(arController.getCameraMatrix());
		arController.setPatternDetectionMode(artoolkit.AR_MATRIX_CODE_DETECTION);
		// arController.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_3x3);
		arController.addEventListener('getMarker', ev => {
			if (ev.data.marker.idMatrix != -1) {
				// console.log( "Marker Index: %s, Matrix id: %s", ev.data.index, ev.data.marker?.idMatrix );
				get_container(ev.data.marker.idMatrix).then(c => {
					if (!c) return;
					fixMatrix(c.container.matrix, ev.data.matrixGL_RH);
					if (c.first_detection)
						scene.add(c.container);
				})
			}
		});

		renderer.setAnimationLoop(renderloop);
	}
	
}

