import { HudElement } from "../HudElement";

export class Face
{
	constructor(wad, entity, {xScreen, yScreen, xOffset, yOffset, padding, scale} = {})
	{
		this.wad = wad;
		this.element = new HudElement(24, 29, {scale, xScreen, yScreen, xOffset, yOffset, padding});
		this.entity = entity;

		this.age = 0;
		this.expressionTimer = 0;
		this.expression = 1;

		this.changeExpression();
	}

	simulate(delta)
	{
		this.age += delta;

		if(performance.now() - this.entity.lastAlertTime < 10_000)
		{
			if(this.entity.lastAlertDot < -0.5)
			{
				this.expression = 0;
			}
			else if(this.entity.lastAlertDot > 0.5)
			{
				this.expression = 2;
			}
			else
			{
				this.expression = 1;
			}
		}
		else
		{
			this.expression = 1;
		}

		this.expressionTimer -= delta;

		if(this.expressionTimer <= 0)
		{
			this.expressionTimer = 600;
			this.changeExpression();
		}
	}

	async changeExpression()
	{
		this.element.clear();

		const face = this.wad.picture('STFST0' + this.expression);

		const faceUrl  = await face.decode();
		this.element.draw(faceUrl, 0, 0, face.width, face.height);
	}
}
