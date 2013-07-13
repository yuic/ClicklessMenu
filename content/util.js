var { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import('resource://gre/modules/Services.jsm', this);

/** /
var loger = function(source){
	var src  = source;
	return function(msg){ dump( new Date().toString().substring(16,24) + ' |' + src + '| ' + msg + '\n' ); }
};
/**/

var $ = function(id){ return window.document.getElementById(id); };
var $EL = function(tag, attr, children, style){ return $ATTRS(window.document.createElement(tag), attr, children, style); };
var $ATTRS = function(el, attr, children, style){
	if(attr) for(let a in attr) el.setAttribute(a, attr[a]);
	if(children) for( let i=0, iLim=children.length; i<iLim; el.appendChild(children[i]), i++ );
	if(style) for(let a in style) el.style[a] = style[a];
	return el;
};
var $isCommittable = function(winAccepted){
	return ( Services.prefs.getBoolPref('browser.preferences.instantApply') || winAccepted );
};
var $extend = function(instantiatedBase, append){
	for(var p in append) instantiatedBase[p] = append[p];
	return instantiatedBase;
};

// common preference keys (except in delayed load keys)
var PrefsKeys = [
	// element id      ,  column name      ,  boolean <-> int (for explicit conversion)
	['menuPosX'        , 'menuPosX'             ],
	['menuPosY'        , 'menuPosY'             ],
	['menuDurClose'    , 'menuDurClose'         ],
	['enableTxtField'  , 'enableTxtField'  , '1'],
	['openTrigger'     , 'openTrigger'          ],
	['triggerKey'      , 'triggerKey'           ],
];

// append delayed load keys into PrefsKeys
var PrefsKeysAll = PrefsKeys.concat([
	['openTabActivate0', 'openTabActivate0', '1'],
	['openTabPos0'     , 'openTabPos0'          ],
	['openTabActivate1', 'openTabActivate1', '1'],
	['openTabPos1'     , 'openTabPos1'          ],
	['openTabActivate2', 'openTabActivate2', '1'],
	['openTabPos2'     , 'openTabPos2'          ],
	['codeLibrary'     , 'codeLibrary'          ],
]);

var dummyF = function(){ return false; };
var dummyN = function(){};
