const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import('resource://gre/modules/Services.jsm');

// for share variables between the browser windows, the preference window and here
var scopes = {};

// load scripts into scope and initialize Clips when open new browser window
function loadIntoWindow(window){
	Cu.import('chrome://clicklessmenu/content/storage.jsm');
	var scope = { Cc : Cc, Ci : Ci, Cu : Cu, window : window, document : window.document };
	['util.js', 'menu.js'].forEach( function(mod){
		Services.scriptloader.loadSubScript('chrome://clicklessmenu/content/' + mod, scope, 'utf-8'); });
	var uniqueKey = new Date().getTime().toString();
	scope.MenuManager.init(uniqueKey);
	scopes[uniqueKey] = scope;
};

var windowListener = {
	onOpenWindow: function(aWindow) {
		let win = this.T(aWindow);
		win.addEventListener('load', function() {
			win.removeEventListener('load', arguments.callee, false);
			if( !windowListener.isBrowser(win) ) return;

			Cu.import('chrome://clicklessmenu/content/storage.jsm');
			DB.init();
			for(var s in scopes) scopes[s].MenuManager.loadAppData();
			loadIntoWindow(win);
		}, false);
	},

	onCloseWindow : function(aWindow){
		let win = this.T(aWindow);
		win.addEventListener('unload', function() {
			win.removeEventListener('unload', arguments.callee, false);
			if( !windowListener.isBrowser(win) ) return;

			let $ = function(id){ return win.document.getElementById(id); };
			delete scopes[ $('mainPopupSet').removeChild($('CLMN_menu')).getAttribute('value') ];
			for(var s in scopes) scopes[s].MenuManager.loadAppData();
		}, false);
	},
	onWindowTitleChange : function(){},
	T: function(win){ return win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow); },
	isBrowser: function(win){ return win.document.documentElement.getAttribute('windowtype') === 'navigator:browser'; }
};

function attachDbFile(){
	var file = Services.dirsvc.get('ProfD', Ci.nsIFile);
		file.append('clicklessmenu.sqlite');
	return file;
};

function startup(params, reason){
	let windows = Services.wm.getEnumerator('navigator:browser');
	while (windows.hasMoreElements()) { loadIntoWindow(windows.getNext().QueryInterface(Ci.nsIDOMWindow)); }
	Services.wm.addListener(windowListener);
};

function shutdown(params, reason){
	for(var s in scopes) scopes[s].MenuManager.shutdown();
	scopes = null;
	Services.wm.removeListener(windowListener);
	Cu.unload('chrome://clicklessmenu/content/storage.jsm');
};

function uninstall(params, reason){
	if(reason === ADDON_UNINSTALL) attachDbFile().remove(false);
};

function install(params, reason) {
	if(reason !== ADDON_UPGRADE) return;

	var file = attachDbFile();
	var conn = Services.storage.openDatabase(file);

	["INSERT INTO 'prefs' VALUES('openTrigger','0');",
	 "INSERT INTO 'prefs' VALUES('triggerKey','alt + Q');"
	].forEach( function(e){ conn.executeSimpleSQL(e); } );

	conn.close();
	file = conn = null;
};
