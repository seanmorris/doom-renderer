import { renderText } from "../helpers";
import { HudElement } from "../HudElement";

export class HudText
{
	constructor(wad, message, {width, xScreen, yScreen, xOffset, yOffset, padding, scale} = {})
	{
		this.wad = wad;
		this.element = new HudElement(width, 7, {scale, xScreen, yScreen, xOffset, yOffset, padding});

		this.age = 0;
		this.message = '';
		this.setMessage(message);
	}

	simulate(delta)
	{
		this.age += delta;
	}

	async setMessage(message)
	{
		if(this.message === message)
		{
			return;
		}

		this.message = message;
		this.element.clear();
		const text = await renderText(this.wad, message);
		this.element.draw(text.url, 0, 0, text.width, text.height);
	}
}
