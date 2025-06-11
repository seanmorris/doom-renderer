%lex

NUMBER			[0-9]+(\.[0-9]+)?\b
WORD			[a-zA-Z_][a-zA-Z0-9_]+\b
esc				\\
STRING			\"[^"]+\"
// STRING  		"(?:{esc}[\"bfnrt/{esc}]|{esc}u[a-fA-F0-9]{4}|[^\"{esc}])*"

%%

"//".*					/* Skip Comments */
\s+						/* Skip whitespace */
"ACTOR"					return 'ACTOR';
"native"				return 'NATIVE';
"States"				return 'STATES';
"{"						return '{';
"}"						return '}';
":"						return ':';
"."						return '.';
","						return ',';
"+"						return '+';
"-"						return '-';
[a-zA-Z0-9]+":"			return 'KEY';
{WORD}					return 'WORD';
{NUMBER}				return 'NUMBER';
[A-Z0-9]{4}\b			return 'SPRITE';
[A-Z\[\]-]+\b			return 'FRAMES';
{STRING}				yytext = yytext.substr(1,yyleng-2); return 'STRING';
"Bright"				return 'Bright';
"CanRaise"				return 'CanRaise';
"Fast"					return 'Fast';
"Light"					return 'Light';
"NoDelay"				return 'NoDelay';
"Offset"				return 'Offset';
"Slow"					return 'Slow';
<<EOF>>					return 'EOF';

/lex

%%

expressions
	: defs
	;

actorName
	: WORD
	| NATIVE
	;

doomEdNum
	: NUMBER
	;

defTitle
	: ACTOR actorName ':' actorName doomEdNum
	| ACTOR actorName ':' actorName
	| ACTOR actorName
	;

propertyName
	: WORD '.' propertyName
	| WORD
	;

propertyValue
	: WORD
	| STRING
	| NUMBER
	;

propertyValues
	: propertyValue ',' propertyValues
	| propertyValue
	;

property
	: propertyName propertyValues
	;

flag
	: '+' WORD
	| '-' WORD
	;

entry
	: property
	| flag
	;

entries
	: entry entries
	| entry
	;

stateKeyword
	: Bright
	| CanRaise
	| Fast
	| Light
	| NoDelay
	| Offset
	| Slow
	;

instruction
	: WORD
	| WORD NUMBER
	;

stateEntry
	: SPRITE FRAMES NUMBER
	| SPRITE FRAMES NUMBER stateKeyword
	| instruction
	;

stateEntries
	: stateEntry stateEntries
	| stateEntry
	;

state
	: KEY stateEntries
	;

states
	: state states
	| state
	;

stateBlock
	: STATES '{' states '}'
	;

defBody
	: '{' entries stateBlock '}'
	| '{' entries '}'
	| '{' stateBlock '}'
	;

def
	: defTitle defBody
	;

defs
	: def
	| def defs
	;
