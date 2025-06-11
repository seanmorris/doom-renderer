import { Side } from "./Side";

export class Line
{
	static lines = new Map;

	static get(level, linedef)
	{
		if(!this.lines.has(linedef))
		{
			this.lines.set(linedef, new Line(level, linedef));
		}

		return this.lines.get(linedef);
	}

	constructor(level, linedef)
	{
		this.level = level;
		this.map = level.map;
		this.linedef = linedef;
		Object.freeze(this);
	}

	front(x, y)
	{
		const from = this.from;
		const to   = this.to;

		const pos  = [(from.y + to.y) / 2, (from.x + to.x) / 2]; // [y, x]
		const vec  = [pos[0] - y, pos[1] - x]; // [y, x]
		const mag  = Math.hypot(...vec);

		vec[0] /= -mag;
		vec[1] /= -mag;

		if(this.dotNormal(...vec) > 0)
		{
			return this.right;
		}
		else
		{
			return this.left;
		}
	}

	back(x, y)
	{
		const from = this.from;
		const to   = this.to;

		const pos  = [(from.y + to.y) / 2, (from.x + to.x) / 2]; // [y, x]
		const vec  = [pos[0] - y, pos[1] - x]; // [y, x]
		const mag  = Math.hypot(...vec);

		vec[0] /= -mag;
		vec[1] /= -mag;

		if(this.dotNormal(...vec) > 0)
		{
			return this.left;
		}
		else
		{
			return this.right;
		}
	}

	get normal()
	{
		const from = this.from;
		const to   = this.to;

		const vec  = [from.x - to.x, to.y - from.y]; // [y, x] (switched up for normal)
		const mag  = Math.hypot(...vec);

		vec[0] /= mag;
		vec[1] /= mag;

		return vec;
	}

	dotNormal(y, x)
	{
		const normal = this.normal;
		return y * normal[0] + x * normal[1];
	}

	get right()
	{
		return Side.get(this.level, this.linedef);
	}

	get left()
	{
		return Side.get(this.level, this.linedef, true);
	}

	get from()
	{
		return this.map.vertex(this.linedef.from);
	}

	get to()
	{
		return this.map.vertex(this.linedef.to);
	}
}
