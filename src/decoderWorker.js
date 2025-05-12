addEventListener("message", async event => {
	if(event.data)
	{
		// const { texture } = event.data;

		console.log(event.data);

		postMessage({data: new Uint8Array([]), done: true});
	}
});
