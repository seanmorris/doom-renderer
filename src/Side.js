import { nearestPointOnLine } from "./helpers";

export class Side
{
	static sides = new Map;

	static get(level, linedef, isLeft = false)
	{
		if(!this.sides.has(linedef))
		{
			this.sides.set(linedef, new Map);
		}

		if(!this.sides.get(linedef).has(isLeft))
		{
			this.sides.get(linedef).set(isLeft, new Side(level, linedef, isLeft));
		}

		return this.sides.get(linedef).get(isLeft);
	}

	constructor(level, linedef, isLeft = false)
	{
		this.level = level;
		this.map = level.map;
		this.linedef = linedef;
		this.isLeft = isLeft;
		Object.freeze(this);
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

	isFacing(y, x)
	{
		const from = this.from;
		const to   = this.to;

		const pos  = [(from.y + to.y) / 2, (from.x + to.x) / 2]; // [y, x]
		const vec  = [pos[0] - y, pos[1] - x]; // [y, x]
		const mag  = Math.hypot(...vec);

		vec[0] /= -mag;
		vec[1] /= -mag;

		return this.dotNormal(...vec) > 0;
	}

	isVisibleAroundCorner(x, y, otherSide)
	{
		const n = this.nearest(x, y, false);
		const eVec = [n.y - y, n.x - x];
		const eMag = Math.hypot(...eVec);

		eVec[0] /= eMag;
		eVec[1] /= eMag;

		const fVec = [n.y - otherSide.from.y, n.x - otherSide.from.x];
		const tVec = [n.y - otherSide.to.y,   n.x - otherSide.to.x];

		const fMag = Math.hypot(...fVec);
		const tMag = Math.hypot(...tVec);

		fVec[0] /= fMag;
		fVec[1] /= fMag;
		tVec[0] /= tMag;
		tVec[1] /= tMag;

		const fDot = fVec[0] * eVec[0] + fVec[1] * eVec[1];
		const tDot = tVec[0] * eVec[0] + tVec[1] * eVec[1];

		const ep = Number.EPSILON * 1000;

		return fDot > ep || tDot > ep;
	}

	nearest(x, y, clamped = false)
	{
		const from = this.from;
		const to   = this.to;

		return nearestPointOnLine(x, y, from.x, from.y, to.x, to.y, clamped);
	}

	frontRoom(x, y)
	{
		const sidedef = this.map.sidedef(
			(this.isFacing(y, x) && !this.isLeft) ? this.linedef.right : this.linedef.left
		);

		return sidedef && this.level.rooms.get(sidedef.sector);
	}

	backRoom(x, y)
	{
		const sidedef = this.map.sidedef(
			(this.isFacing(y, x) && !this.isLeft) ? this.linedef.left : this.linedef.right
		);

		return sidedef && this.level.rooms.get(sidedef.sector);
	}

	get from()
	{
		return this.map.vertex(this.isLeft ? this.linedef.to : this.linedef.from);
	}

	get to()
	{
		return this.map.vertex(this.isLeft ? this.linedef.from : this.linedef.to);
	}

	passable(x, y)
	{
		if(this.linedef.flags & 0b1)
		{
			return false;
		}

		const frontRoom = this.frontRoom(x, y);
		const backRoom = this.backRoom(x, y);

		if(!backRoom || !frontRoom)
		{
			return false;
		}

		if(backRoom.floorHeight - frontRoom.floorHeight > 32)
		{
			return false;
		}

		if(backRoom.ceilingHeight - backRoom.floorHeight < 48)
		{
			return false;
		}

		return true;
	}
}