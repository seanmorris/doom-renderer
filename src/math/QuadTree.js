import { Rectangle } from "./Rectangle";

export class QuadTree extends Rectangle
{
	constructor(x1, y1, x2, y2, minSize = 0, parent = null)
	{
		super(x1, y1, x2, y2);
		this.count = 0;
		this.items = new Set;
		this.split = false;
		this.minSize = minSize || 10;
		this.backMap = parent ? parent.backMap : new Map
		this.parent = parent;
		this.root = parent ? parent.root : this;

		this.ulCell = this.ulCache = null;
		this.urCell = this.urCache = null;
		this.blCell = this.blCache = null;
		this.brCell = this.brCache = null;

		this.cellName = 'r';
	}

	static getLeaf(parent, xCell, yCell, cache = null)
	{
		if(cache)
		{
			const leaf = cache.deref();
			if(leaf) return leaf;
		}

		const xSize = parent.x2 - parent.x1;
		const ySize = parent.y2 - parent.y1;

		const xSizeHalf = 0.5 * xSize;
		const ySizeHalf = 0.5 * ySize;

		const x1 = parent.x1 + xSizeHalf * xCell;
		const x2 = x1 + xSizeHalf;

		const y1 = parent.y1 + ySizeHalf * yCell;
		const y2 = y1 + ySizeHalf;

		const leaf = new QuadTree(
			x1, y1, x2, y2
			, parent.minSize
			, parent
		);

		leaf.cellName = parent.cellName + `:${xCell}${yCell}`;

		return leaf;
	}

	add(entity)
	{
		if(!this.contains(entity.position.x, entity.position.y))
		{
			if(!this.parent)
			{
				// console.warn('No QuadTree cell found!');
			}
			return false;
		}

		const xSize = this.x2 - this.x1;
		const ySize = this.y2 - this.y1;

		if(this.split)
		{
			return this.ulCell.add(entity)
				|| this.urCell.add(entity)
				|| this.blCell.add(entity)
				|| this.brCell.add(entity);
		}
		else if(this.items.size && xSize > this.minSize && ySize > this.minSize)
		{
			this.split  = true;

			this.ulCell = QuadTree.getLeaf(this, 0, 0, this.ulCache);
			this.urCell = QuadTree.getLeaf(this, 1, 0, this.urCache);
			this.blCell = QuadTree.getLeaf(this, 0, 1, this.blCache);
			this.brCell = QuadTree.getLeaf(this, 1, 1, this.brCache);

			this.ulCache = new WeakRef(this.ulCell);
			this.urCache = new WeakRef(this.urCell);
			this.blCache = new WeakRef(this.blCell);
			this.brCache = new WeakRef(this.brCell);

			// console.log('SPLIT', this.cellName);
			let parent = this;

			while(parent)
			{
				parent.count -= this.items.size;
				parent = parent.parent;
			}

			for(const item of this.items)
			{
				let parent = this;
				let added = false;

				while(parent)
				{
					added = parent.ulCell.add(item)
						||  parent.urCell.add(item)
						||  parent.blCell.add(item)
						||  parent.brCell.add(item);
					if(added) break;
					parent = parent.parent;
				}

				if(!added)
				{
					this.root.onBadSplit(item);
				}

				this.items.delete(item);
			}

			return this.ulCell.add(entity)
				|| this.urCell.add(entity)
				|| this.blCell.add(entity)
				|| this.brCell.add(entity);

		}
		else
		{
			if(!this.items.has(entity))
			{
				let parent = this;
				while(parent)
				{
					parent.count++;
					parent = parent.parent;
				}
			}

			this.backMap.set(entity, this);
			this.items.add(entity);
			return true;
		}
	}

	move(entity)
	{
		if(!this.backMap.has(entity))
		{
			// console.warn('Entity not in QuadTree.');
			return this.add(entity);
		}

		const startCell = this.backMap.get(entity);

		let cell = startCell;
		while(cell && !cell.contains(entity.position.x, entity.position.y))
		{
			cell = cell.parent;
		}

		if(!cell)
		{
			console.warn('No QuadTree cell found!');
			startCell.delete(entity);
			return false;
		}

		if(cell !== startCell)
		{
			startCell.delete(entity);
			cell.add(entity);
		}

		return true;
	}

	delete(entity)
	{
		if(!this.backMap.has(entity))
		{
			console.warn('Entity not in QuadTree.');
			return false;
		}

		const cell = this.backMap.get(entity);
		this.backMap.delete(entity);
		cell.items.delete(entity);

		if(cell.parent)
		{
			cell.parent.prune();
		}

		let parent = cell;
		while(parent)
		{
			parent.count--;
			parent = parent.parent;
		}

		return true;
	}

	isPrunable()
	{
		if(this.split)
		{
			return this.ulCell.isPrunable()
				&& this.urCell.isPrunable()
				&& this.blCell.isPrunable()
				&& this.brCell.isPrunable();
		}
		else
		{
			return this.items.size === 0;
		}
	}

	prune()
	{
		if(!this.isPrunable())
		{
			return false;
		}

		this.split = false;

		// console.log('PRUNE', this.cellName);

		this.ulCell = null;
		this.urCell = null;
		this.blCell = null;
		this.brCell = null;

		return true;
	}

	findLeaf(x, y)
	{
		if(!this.contains(x, y))
		{
			return null;
		}

		if(!this.split)
		{
			return this;
		}

		return this.ulCell.findLeaf(x, y)
			?? this.urCell.findLeaf(x, y)
			?? this.blCell.findLeaf(x, y)
			?? this.brCell.findLeaf(x, y);
	}

	has(entity)
	{
		if(this.split)
		{
			return this.ulCell.has(entity)
				|| this.urCell.has(entity)
				|| this.blCell.has(entity)
				|| this.brCell.has(entity);
		}

		return this.items.has(entity);
	}

	select(x1, y1, x2, y2)
	{
		if(x1 > this.x2 || x2 < this.x1)
		{
			return new Set;
		}

		if(y1 > this.y2 || y2 < this.y1)
		{
			return new Set;
		}

		if(this.split)
		{
			return new Set([
				...this.ulCell.select(x1, y1, x2, y2)
				, ...this.urCell.select(x1, y1, x2, y2)
				, ...this.blCell.select(x1, y1, x2, y2)
				, ...this.brCell.select(x1, y1, x2, y2)
			]);
		}

		return new Set(this.items);
	}

	dump()
	{
		if(this.split)
		{
			return new Set([
				...this.ulCell.dump()
				, ...this.urCell.dump()
				, ...this.blCell.dump()
				, ...this.brCell.dump()
			]);
		}

		return new Set(this.items);
	}

	onBadSplit(item)
	{
		console.warn('Bad split!', item);
	}
}
