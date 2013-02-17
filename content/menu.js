//var log = loger('M  ');

var MenuManager = {
	// appcontentにくっつけるイベントリスナ ／ MenuManagerが使う
	listeners: {
		'mousedown': function CLMN_mousedown(e){ MenuManager.draggingEntryX = e.screenX; MenuManager.draggingEntryY = e.screenY; },
		'mouseup'  : function CLMN_mouseup(e)  { MenuManager.reOpen(e); },
		'dblclick' : function CLMN_dblclick(e) { MenuManager.reOpen(e); }
	},

	init: function(aUnique){
		this.draggingEntryX = this.draggingEntryX = 0;
		for(var e in this.listeners) $('appcontent').addEventListener(e, this.listeners[e] , false);

		this.menu = $EL(OsDiffAbsober[Services.appinfo.OS].menuElement, {id: 'CLMN_menu', value: aUnique, noautofocus: true, noautohide: true});
		var menuListeners = {
			'mouseover'  : function(e){ MenuManager.abortTimers(); },
			'mouseout'   : function(e){ MenuManager.setCloseTimer(); },
			'click'      : function(e){ MenuManager.runMenu(e); },
			'prefclose'  : function(e){ MenuManager.loadAppData(); },
		};
		for(var ev in menuListeners) this.menu.addEventListener(ev, menuListeners[ev].bind(this), true);

		$('mainPopupSet').appendChild( this.menu );
	},

	// close & open Menu / book close
	reOpen: function(e){
		// load common preferences & clip data
		if( $('CLMN_menu').childNodes.length === 0 ){
			DB.init();
			this.loadAppData();
		}
		this.closeMenu();

		// 検索対象文字列を確定
		var cd = document.commandDispatcher;
		var focused = cd.focusedElement;
		this.selectedChars = ( cd.focusedWindow.getSelection().toString()
			|| (this.enableTxtField && focused && focused.value && focused.value.substring(focused.selectionStart, focused.selectionEnd)) );

		if( this.preventOpen(e) ) return;
		this.openMenu(e);
	},

	// conditions of prevent for open popup
	//  1. no characters are selected (characters in text area is optional)
	//  2. not left clicked
	//  3. mouseup event without drag (for when anchor tag clicked)
	preventOpen: function(e){
		return( ( !this.selectedChars )
			||  ( e.button !== 0 )
			||  ( e.type === 'mouseup' && e.screenX === this.draggingEntryX && e.screenY === this.draggingEntryY )
		);
	},

	// notify open to clips
	openMenu:  function(e){
		// timer to open
		this.openTimer = window.setTimeout(function() {
			this.menu.openPopupAtScreen( e.screenX + Number( this.menuPosX ), e.screenY + Number( this.menuPosY ), true );
			this.setCloseTimer();
		}.bind(this), this.menuDurOpen);
	},

	// notify close to clips
	closeMenu: function(){
		this.abortTimers();
		if(this.menu) this.menu.hidePopup();
	},

	// set close timer
	setCloseTimer: function(){
		this.closeTimer = window.setTimeout( function(){ this.closeMenu(); }.bind(this), this.menuDurClose );
	},

	// calcel close timer
	abortTimers: function(){
		window.clearTimeout(this.openTimer);
		window.clearTimeout(this.closeTimer);
	},

	// 最新の尺度情報(DB値)をclipに反映する(前回までのものは削除)
	loadAppData: function(){
		// load common preferences (except in delayed load keys)
		var prefs = DB.getPrefs();
		PrefsKeys.forEach( function(e){
			( e[2] ) ? this[ e[0] ] = (prefs[ e[1] ] === e[2])
					 : this[ e[0] ] =  prefs[ e[1] ]
		}, this );

		this.refreshMenu();
	},

	// menuにDB値反映
	refreshMenu: function(){
		var children = this.menu.childNodes;
		for(var i=children.length-1; i>=0; i--) this.menu.removeChild(children[i]);

		var menuitemElement = OsDiffAbsober[Services.appinfo.OS].itemElement;
		DB.getMenuData().forEach(function(e){
			this.menu.appendChild( (e.url_script === '<separator>')
				? $EL('menuseparator')
				: $EL(menuitemElement, {
					id   :  e.id,
					label:  e.name,
					image: (e.favicon || 'chrome://clicklessmenu/content/icon/book.ico'),
					class: 'menuitem-iconic'}
				  )
			);
		}.bind(this));
	},

	// get 'URL/SCRIPT' from db, and decide how run
	runMenu: function(e){
		if(e.target.tagName === 'menuseparator') return;

		var {url_script, isScript} = DB.getUrlScriptById(e.target.id);
		var prefs = DB.getPrefs();
		var opentabPosition = prefs['openTabPos' + e.button];
		if(opentabPosition === '3'){	// not assigned
			e.preventDefault();
			return;
		}

		(isScript === 1)
			? this.execCmd(url_script)
			: this.openUrl(url_script, opentabPosition, prefs['openTabActivate' + e.button])
		;
	},

	// execute user script
	execCmd: function(script){
		window.setTimeout(script, 0);
		this.menu.hidePopup();
	},

	// open the url in background and menu is not close
	openUrl: function(aUrl, openTabPos, openTabActivate){
		var url = this.composeUrl(aUrl, this.selectedChars);
		(openTabPos === '2')
			? (window.open(url))
			: Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser
					.loadOneTab( url, {relatedToCurrent: (openTabPos === '0'), inBackground: (openTabActivate === '0')} );
		this.menu.hidePopup();
	},

	// trim, compose, URL encode and schema repair if neccesary
	composeUrl: function(aUrl, aParam){
		// url encord & change replacer
		var param = (aUrl.replace( /<.*>/g,'').length !== 0) ? encodeURIComponent(aParam.trim()) : aParam.trim();
		var url = aUrl.replace(/<.*>/g, param);

		// repair schema if it broken
		if(url.indexOf('ttp://') === 0 || url.indexOf('ttps://') === 0 ){
			url = 'h' + url;
		}else if(url.indexOf('://') < 0 ){
			url = 'http://' + url;
		}
		return url;
	},

	// 配下の全インスタンス開放
	shutdown: function(ev){
		DB.destroy();
		this.abortTimers();
		this.menu = null;
		$('mainPopupSet').removeChild( $('CLMN_menu') );
		for(var e in this.listeners) $('appcontent').removeEventListener(e, this.listeners[e]);
	},

};

// absorb the differences between the OS.
// in Linux, menupopup takes over the focus from 'contentpane'.
// and mousedown event will be prevented.
var OsDiffAbsober = {
	WINNT: {
		menuElement: 'menupopup',
		itemElement: 'menuitem'
	},
	Linux: {
		menuElement: 'panel',
		itemElement: 'toolbarbutton'
	},
	Darwin: {	// for MacOS, just in case
		menuElement: 'menupopup',
		itemElement: 'menuitem'
	}
};
