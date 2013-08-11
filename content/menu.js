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

	// close menu and cancel timer
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
		while(this.menu.hasChildNodes()) this.menu.removeChild(this.menu.firstChild);

		var ItemUtil = {
			// get the domain of url or the first row of user script
			getTooltip: function(e){
				if(e.isScript){
					// get the first row
					return e.url_script.match(/^.*\n*/i);
				}else{
					// get domain
					if( e.url_script.indexOf('about:') === 0 || e.url_script.indexOf('chrome://') === 0 ){
						return e.url_script
					} else {
						var domain = (e.url_script.match(/^[httpsfile]+:\/{2,3}([0-9a-zA-Z\.\-:]+?)\//i));
						return (domain ? domain[1] : '');
					}
				}
			},
			getTypicalAttrs: function(e){
				return { id:  'clicklessmenu.menuitem.' + e.id, label:  e.name, class: 'menuitem-iconic',
					image: (e.favicon || 'chrome://clicklessmenu/content/icon/book.ico') }
			},
			// if iconBox(hbox) is already created, append it to menupopup before current menuitem
			appendLastBoxAndChild: function(el, menu){
				if(iconBox && menu.appendChild(iconBox)) iconBox = null; menu.appendChild(el);
			},
		};
		var iconBox;	// for iconized menuitems that are horizontal alignment
		DB.getMenuData().forEach( function(e){
			if(e.url_script === '<separator>') {	// menuseparator
				ItemUtil.appendLastBoxAndChild( $EL('menuseparator'), this.menu );
			} else {
				// do not attach tooltip text in linux
				var attrs = $extend( ItemUtil.getTypicalAttrs(e), { WINNT: {tooltiptext: ItemUtil.getTooltip(e)} }[Services.appinfo.OS] );
				if(e.name){
					ItemUtil.appendLastBoxAndChild( $EL(MenuManager.osGap.itemElement, attrs), this.menu );
				}else{
					if(!iconBox) iconBox = $EL('toolbox', null, [$EL('hbox')], {border: 'none'});
					iconBox.firstChild.appendChild( $EL('toolbarbutton', attrs) );
				}
			}
		}.bind(this) );
		if(iconBox) this.menu.appendChild( iconBox );
	},

	// get 'URL/SCRIPT' from db, and decide how run
	runMenu: function(e){
		if(e.target.tagName === 'menuseparator' || !e.target.id) return;

		var {url_script, isScript} = DB.getUrlScriptById(e.target.id.substring(23));	// truncate 'clicklessmenu.menuitem.'
		var prefs = DB.getPrefs();
		var opentabPosition = prefs['openTabPos' + e.button];

		if(isScript === 1){
			if(opentabPosition !== '3'){
				window.setTimeout( '(function(){\ntry{' + prefs.codeLibrary +
				'\n} catch(CLICKLESSMENU_EXP){Cu.reportError("ClicklessMenu: common code error\\n " + CLICKLESSMENU_EXP);};\n' +
				url_script + '\n})();' , 0);
			}
		} else {
			MenuManager.behaviors[ opentabPosition ]({
				url: this.composeUrl(url_script, this.selectedChars),
				pos: opentabPosition,
				act: prefs['openTabActivate' + e.button]
			});
		}
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
		4: function({url}){ window.openWebPanel('', url); },	// open in sidebar
	},

	// trim, compose, URL encode and schema repair if neccesary
	composeUrl: function(aUrl, aParam){
		// url encord & change replacer
		var param = (aUrl.replace( /<.*>/g,'').length !== 0) ? encodeURIComponent(aParam.trim()) : aParam.trim();
		var url = aUrl.replace(/<.*>/g, param);

		// repair schema if it broken
		switch(true){
			case (url.indexOf('ttp://' ) === 0) :;							/* break; */
			case (url.indexOf('ttps://') === 0) : url = 'h' + url;			break;
			case (url.indexOf(':') < 0)         : url = 'http://' + url;	break;
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
	osGap: {
		WINNT:  { menuElement: 'menupopup', itemElement: 'menuitem'      },
		Linux:  { menuElement: 'panel'    , itemElement: 'toolbarbutton' },
		Darwin: { menuElement: 'panel'    , itemElement: 'toolbarbutton' }
	}[Services.appinfo.OS],
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

		var keyAttrs = {id: 'clicklessmenu_key', modifiers: modifiers, oncommand: 'void(0);'};
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
