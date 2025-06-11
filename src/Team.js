export class Team {
	static enemies = new Set();
	static friends = new Set();
	static neutral = new Set();
}

export class GoodGuys extends Team{
	static enemies = new Set();
	static friends = new Set();
	static neutral = new Set();
};

export class BadGuys extends Team{
	static enemies = new Set();
	static friends = new Set();
	static neutral = new Set();
};

GoodGuys.enemies.add(BadGuys);
BadGuys.enemies.add(GoodGuys);

Object.freeze(Team);
