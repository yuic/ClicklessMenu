//var log = loger('M  ');

var MenuManager = {
	init: function(aUnique){
		this.menu = $EL(this.osGap.menuElement, {id: 'CLMN_menu', value: aUnique, noautofocus: true, noautohide: true});
		var menuListeners = {
			'mouseover'  : function(e){ MenuManager.abortTimers(); },
			'mouseout'   : function(e){ MenuManager.setCloseTimer(); },
			'click'      : function(e){ MenuManager.runMenu(e); },
		};
		for(var ev in menuListeners) this.menu.addEventListener(ev, menuListeners[ev]);
		$('mainPopupSet').appendChild( this.menu );

		window.setTimeout(this.loadAppData.bind(this), 500);
	},

	// close & open Menu / book close
	reOpen: function(e){
		// 検索対象文字列を確定
		MenuManager.selectedChars = MenuManager.getSelectedChars();

		if( this.trigger.preventOpen(e) ) return;
		this.menu.openPopupAtScreen( e.screenX + Number( this.menuPosX ), e.screenY + Number( this.menuPosY ), true );
		this.setCloseTimer();
	},

	// 
	getSelectedChars: function(){
		var cd = document.commandDispatcher;
		var focused = cd.focusedElement;
		return ( cd.focusedWindow.getSelection().toString()
			|| (this.enableTxtField && focused && focused.value && focused.value.substring(focused.selectionStart, focused.selectionEnd)) );
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
	abortTimers: function(){ window.clearTimeout(this.closeTimer); },

	// 最新のデータをmenuに反映する(前回までのものは削除)
	loadAppData: function(){
		// load common preferences (except in delayed load keys)
		DB.init();
		var prefs = DB.getPrefs();
		PrefsKeys.forEach( function(e){
			( e[2] ) ? this[ e[0] ] = (prefs[ e[1] ] === e[2])
					 : this[ e[0] ] =  prefs[ e[1] ]
		}, this );

		this.refreshMenu();

		// prepare popup triggers
		(this.trigger = TriggerSwitcher[this.openTrigger]).keySetup();
		delete this.openTrigger;
		delete this.triggerKey;

		// listeners for appcontent is watching popup triggers
		var content  = $('appcontent');
		for(var e in this.trigger.listeners) content.addEventListener(e, this.trigger.listeners[e]);
	},

	// menuにDB値反映
	refreshMenu: function(){
		var children = this.menu.childNodes;
		for(var i=children.length-1; i>=0; i--) this.menu.removeChild(children[i]);

		var menuitemElement = this.osGap.itemElement;
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

		(isScript === 1)
			? (opentabPosition!=='3') && window.setTimeout(url_script, 0)
			: MenuManager.behaviors[ opentabPosition ]({
				url: this.composeUrl(url_script, this.selectedChars),
				pos: opentabPosition,
				act: prefs['openTabActivate' + e.button]
			  });
		this.closeMenu();
	},

	// open url according to preferences
	behaviors: {
		0: function({url, pos, act}){	// 現在のタブの右に開く
			Services.wm.getMostRecentWindow("navigator:browser").gBrowser
				.loadOneTab( url, {relatedToCurrent: (pos === '0'), inBackground: (act === '0')} );
		},
		1: function(args){ MenuManager.behaviors[0](args); },	// 末尾に開く
		2: function({url}){ window.open(url); },	// 新しいウィンドウで開く
		3: dummyN,	// 割当なし
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

	// ちょっと捨てる
	dispose: function(){
		this.abortTimers();
		TriggerSwitcher.removeKeyset();
		var content = $('appcontent');
		for(var e in this.trigger.listeners) content.removeEventListener(e, this.trigger.listeners[e]);
	},

	// 配下の全インスタンス開放
	shutdown: function(ev){
		DB.destroy();
		this.dispose();
		this.menu = null;
		$('mainPopupSet').removeChild( $('CLMN_menu') );
	},

	// close the gap between each OS
	osGap: null,
};


// ポップアップ方式を分割する人
// 要素名が数字のやつがポップアップ方式の実装
var TriggerSwitcher = {
	setScreenXY : function(e){ return {screenX: e.screenX, screenY: e.screenY}; },
	reOpen   : function(e){ MenuManager.reOpen(e); },
	loadPref : function(e){ MenuManager.dispose(); MenuManager.loadAppData(); },

	// create key element
	keySetup: function(){
		TriggerSwitcher.removeKeyset();

		// DBからとってきたやつを要素生成用にばらす: 'ctrl + shift + alt + A' -> [ctrl, shift, alt, A]
		var modifiers = MenuManager.triggerKey.split(' + ');
		var key = modifiers.pop();
		if(modifiers[0] === 'ctrl') modifiers[0] = 'control';

		var keyAttrs = {id: 'clipreference_key', modifiers: modifiers, oncommand: 'void(0);'};
		$extend( keyAttrs, (key.length > 1 ? {keycode: 'VK_' + key} : {key: key}) );
		var keyEl = $EL('key', keyAttrs);

		keyEl.addEventListener('command', function(e){
			var event = window.document.createEvent('CustomEvent');
			event.initCustomEvent('hotkey', true, true, null);
			$('appcontent').dispatchEvent(event);
		}, false);
		$('mainKeyset').parentNode.appendChild( $EL('keyset', {id: 'clicklessmenu_keyset'}, [keyEl]) );
	},
	removeKeyset : function(){
		var lastkeyset = $('clicklessmenu_keyset');
		if(lastkeyset) lastkeyset.parentNode.removeChild(lastkeyset);
	},
};
// functionの生成数を減らす。参照エラー回避のためにTriggerSwitcherを生成してから中身を入れる
$extend(TriggerSwitcher, {
	// type-immediate.  popup when select the string.
	0: {
		// set up the hot key
		keySetup: dummyN,

		// appcontentにくっつけるイベントリスナ
		listeners: {
			'prefclose': TriggerSwitcher.loadPref,
			'dblclick' : TriggerSwitcher.reOpen,
			'mouseup'  : TriggerSwitcher.reOpen,
			'mousedown': function(e){
				MenuManager.closeMenu();
				MenuManager.entryPoint = {screenX: e.screenX, screenY: e.screenY};
			},
		},

		// conditions to prevent popup
		//  1. no characters are selected
		//  2. not main mouse button
		//  3. mouseup event without drag (for when anchor tag clicked)
		preventOpen: function(e){
			return( ( !MenuManager.selectedChars )
				||  ( e.button !== 0 )
				||  ( e.type === 'mouseup' && e.screenX === MenuManager.entryPoint.screenX
						&& e.screenY === MenuManager.entryPoint.screenY )
			);
		},
	},

	// type-hotkey.  popup when press the hotkey after characters selected.
	1: {
		keySetup: TriggerSwitcher.keySetup,
		listeners: {
			'prefclose': TriggerSwitcher.loadPref,
			'hotkey'   : function(e){ MenuManager.reOpen( $extend(e, MenuManager.endPoint) ); },
			'mousedown': MenuManager.closeMenu(),
			'mouseup'  : function(e){ MenuManager.endPoint = TriggerSwitcher.setScreenXY(e); },
		},
		//  1. no characters are selected
		preventOpen: function(e){ return( !MenuManager.selectedChars ); },
	},

	// type-hold.  popup when select the string while hold down the hotkey.
	2: {
		keySetup: TriggerSwitcher.keySetup,
		listeners: {
			'prefclose': TriggerSwitcher.loadPref,
			'dblclick' : TriggerSwitcher.reOpen,
			'hotkey'   : function(e){ MenuManager.keypressflg = true; },
			'mousedown': function(e){
				MenuManager.closeMenu();
				MenuManager.entryPoint = TriggerSwitcher.setScreenXY(e);
				MenuManager.keypressflg = false;
			},
			'mouseup'  : function(e){
				MenuManager.endPoint = TriggerSwitcher.setScreenXY(e);
				MenuManager.reOpen(e);
			},
		},
		//  1. no characters are selected
		//  2. not main mouse button
		//  3. mouseup event without drag (for when anchor tag clicked)
		//  4. hotkey is not hold down
		preventOpen: function(e){
			return( ( !MenuManager.selectedChars )
				||  ( e.button !== 0 )
				||  ( e.type === 'mouseup' && e.screenX === MenuManager.entryPoint.screenX
						&& e.screenY === MenuManager.entryPoint.screenY )
				||  ( !MenuManager.keypressflg )
			);
		},
	},
});


// inject entity to MenuManager.osGap along each OS.
// in Linux, menupopup takes over the focus from 'appContent'.
// and mousedown event will be prevented.
MenuManager.osGap = {
	WINNT: {
		menuElement: 'menupopup',
		itemElement: 'menuitem'
	},
	Linux: {
		menuElement: 'panel',
		itemElement: 'toolbarbutton'
	},
	Darwin: {	// just in case
		menuElement: 'panel',
		itemElement: 'toolbarbutton'
	}
}[Services.appinfo.OS];
