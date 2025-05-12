import * as THREE from 'three';
import MissingTexture from './MissingTexture3D.png';

export const byteToLightOffset = byte => byte > -1 ? (33 - Math.ceil(byte / 8)) : byte;
export const flipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMax - (vertex.y - map.bounds.yMin)});
export const unflipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMin - (vertex.y - map.bounds.yMax)});

export const textureLoader = new THREE.TextureLoader();
export const missing = textureLoader.load(MissingTexture);

export const loadTexture = async (wad, name, lightLevel) => {
	const wadTexture = wad.texture(name.toUpperCase()) || wad.flat(name.toUpperCase());

	if(!wadTexture)
	{
		console.log(name);
	}

	const texture = wadTexture
		? textureLoader.load(await wadTexture.decode(lightLevel))
		: missing.clone();

	texture.userData.wadTexture = wadTexture;
	texture.userData.missing = !wadTexture;

	texture.magFilter = THREE.NearestFilter;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;

	return texture;
}

export const isTextureName = name => {
	return name
		&& name !== '-'
		&& name !== 'AASTINKY'
		&& name !== 'AASHITTY';
}

const audioCtx = new (AudioContext || webkitAudioContext);

export const samplesPlaying = new Map;
export const playSample = (sample, xPosition, yPosition) => {
	if(!sample)
	{
		console.warn('Invalid sample.', sample);
		return;
	}

	const buffer = audioCtx.createBuffer(1, sample.length, sample.rate);
	const channelData = buffer.getChannelData(0);

	for(let i = 0; i < sample.length; i++)
	{
		channelData[i] = (sample.samples[i] - 128) / 128;
	}

	const source  = audioCtx.createBufferSource();
	const stereo  = new StereoPannerNode(audioCtx, {pan: 0});
	const gain    = new GainNode(audioCtx, {gain: 0.5});
	source.buffer = buffer;

	source.connect(gain).connect(stereo).connect(audioCtx.destination);

	source.start();

	let accept;
	const waiter = new Promise(a => accept = a);

	source.addEventListener('ended', () => {
		samplesPlaying.delete(sample);
		accept();
	}, {once: true});

	samplesPlaying.set(buffer, {xPosition, yPosition, stereo, gain});

	return waiter;
};
