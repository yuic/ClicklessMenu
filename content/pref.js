//var log = function(msg){ dump( new Date().toString().substring(16,24) + ' |  D| ' + msg + '\n' ); }

var Pref = {
	userAcceptWin: false,
	menuItems : null,
	ICON_DEL_GLAY	: 'chrome://clicklessmenu/content/icon/deleteG.ico',
	ICON_DEL_RED	: 'chrome://clicklessmenu/content/icon/deleteR.ico',
	ICON_LOCKED		: 'chrome://clicklessmenu/content/icon/locked_g.ico',
	ICON_UNLOCK		: 'chrome://clicklessmenu/content/icon/unlock_g.ico',

	// ブラウザウィンドウのClip向けにイベントを発火しClipインスタンス上の尺度データをDBに反映
	// その後、DBから値取得して設定画面へ展開
	load: function(){
		Pref.dataLoad();
		$('cmdtree').view = treeView;
	},

	unload: function(){
		if( $isCommittable(Pref.userAcceptWin) ){
			// 共通設定用データを収集しprefを更新
			var prefs = [];
			PrefsKeysAll.forEach(function(e, i){
				( e[2] ) ? prefs[i] = [ e[1], ( ($(e[0]).checked)?1:0 ) ]
						 : prefs[i] = [ e[1],    $(e[0]).value ];
			});
			DB.updatePrefs(prefs);
			DB.updateMenuData( Pref.prepareItems() );	// ツリー用データを収集しcommandを更新
			Pref.notifyUpdated();						// 編集終了のお知らせ
		}
		Pref.menuItems = null;
		DB.destroy();
	},

	// 開いてる全gBrowserに設定が変更されたことを通知する
	notifyUpdated: function(){
		var menu, wins = Services.wm.getEnumerator('navigator:browser');
		while (wins.hasMoreElements())
			if( menu = wins.getNext().QueryInterface(Ci.nsIDOMWindow).document.getElementById('appcontent') )
				menu.dispatchEvent( new CustomEvent("prefclose") );
	},

	// 設定画面に放り込むデータの収集
	dataLoad: function(){
		DB.init();
		// テーブルprefをロードして画面に注入
		var prefs = DB.getPrefs();
		PrefsKeysAll.forEach( function(e){
			( e[2] ) ? $( e[0] ).checked = (prefs[ e[1] ] === e[2])
					 : $( e[0] ).value   =  prefs[ e[1] ]
		} );

		// テーブルcommandをロードしてtreeに注入
		// この時点でdelete button, no image, explain itemを充填しておく
		Pref.menuItems = DB.getMenuData();
		Pref.fillIconGlay();
		Pref.appendExplainItem();
	},

	fillIconGlay: function(){
		for(var i=0, j=Pref.menuItems.length; i<j; i++) Pref.menuItems[i].delete = Pref.ICON_DEL_GLAY;
	},

	// cast menuItems for insert db
	prepareItems: function(){
		var rArray = [];
		// delete row: explain item
		for(var i=newId=0, iLim=Pref.menuItems.length-1; i<iLim; i++){
			var e = Pref.menuItems[i];
			// renumber command.id / delete col: delete button / delete url field that is undefined
			if(e.url_script) rArray.push([ newId++, e.name, e.url_script, e.isScript, e.favicon ]);
		}
		return rArray;
	},

	// set icon manually from local directory. display filepicker and convert image to base64
	loadLocalIcon : function(){
		var nsIFilePicker = Ci.nsIFilePicker;
		var fp = Cc['@mozilla.org/filepicker;1'].createInstance(nsIFilePicker);
			fp.appendFilter($LOCALE('pref.fileKind.icon'),'*.ico');
			fp.appendFilters(nsIFilePicker.filterAll);
			fp.init(window, $LOCALE('pref.filepicker.title'), nsIFilePicker.modeOpen);
		var res = fp.show();

		if(res !== nsIFilePicker.returnOK) return;

		var fileStream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
			fileStream.init(fp.file, -1, -1, false);
		var binaryStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
			binaryStream.setInputStream(fileStream);
		var bytes = binaryStream.readBytes(fileStream.available());
			binaryStream.close();
			fileStream.close();
		return ('data:image/x-icon;base64,' + btoa(bytes));
	},

	// get favicon by given url
	getFavicon: function (row, url) {
		if(!url) return;
		try{
			var reqHTML = new XMLHttpRequest();
			reqHTML.open( 'GET', url.replace(/<.*>/g, '') );
			reqHTML.responseType = 'document';
			reqHTML.onload = function(){
				var iconUrls = Pref.extractFaviconUrls(reqHTML);
					iconUrls.push(url.match(/http(s*):\/\/.*?\//g) + 'favicon.ico');
				Pref.loadFavicon(iconUrls, 0, row);
			}
			reqHTML.send();
		} catch(e){ /*log(e);*/ }	// mainly, edit 'URL/SCRIPT' field when unchecked 'SCRIPT?' field
	},

	// try to obtain favicon url from link tag in html page.
	// ignore the second definition.
	extractFaviconUrls: function(req){
		if(req.status !== 200) return;
		var urlArray = [], iconNode;
		['/html/head/link[@rel="shortcut icon"]', '/html/head/link[@rel="icon"]'].forEach(function(elm){
			if(iconNode = Pref.evaluateXPath(req.responseXML, elm)[0]) urlArray.push( iconNode.href );
		});
		return urlArray;
	},

	loadFavicon: function(urls, idx, row){
		if(urls.length-1 < idx) {
			Pref.notify( 'boxNotify', 'warning', $LOCALE('pref.notify.iconnotfound') );
			return;
		}

		var reqIcon = new XMLHttpRequest();
		reqIcon.open('GET', urls[idx]);
		reqIcon.overrideMimeType('text/plain; charset=x-user-defined');
		reqIcon.onload = function(){
			if( reqIcon.status === 200 ) {
				Pref.menuItems[row].favicon = Pref.convert2DataUri(reqIcon);
				treeView.treebox.invalidate();
				return;
			}
			Pref.loadFavicon(urls, idx+1, row);
		}
		reqIcon.send();
	},

	evaluateXPath: function(aNode, aExpr) {
		var xpe = Cc["@mozilla.org/dom/xpath-evaluator;1"].createInstance(Ci.nsIDOMXPathEvaluator);
		var nsResolver = xpe.createNSResolver(
			(aNode.ownerDocument === null) ? aNode.documentElement : aNode.ownerDocument.documentElement
		);
		var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
		var found = [];
		var res;
		while (res = result.iterateNext()) found.push(res);
		return found;
	},

	// from XMLHttpRequest(response) object to data uri
	convert2DataUri: function(req){
		for( var res=req.responseText, bytearray=[], i=0, l=res.length; i<l; bytearray[i]=res.charCodeAt(i) &0xff, i++ );
		return 'data:' + req.getResponseHeader('Content-Type') + ';base64,' + btoa( String.fromCharCode.apply(String, bytearray) );
	},

	// 
	notify: function(elm, type, msg){
		var notifyBox = $(elm);
		var notification = notifyBox.appendNotification(msg);
		notification.type = type;
		setTimeout(function() { notifyBox.removeCurrentNotification(); }, 6000);
	},

	appendExplainItem: function(){
		Pref.menuItems.push({ id: 0, name: '', url_script: $LOCALE('pref.treeview.howtoappend'), isScript: 0, favicon: null });
	},

	isReady2Restore: false,
	// guard restore button from wrong operation
	guardRestore: function(e){
		Pref.isReady2Restore = $('restoreGuard').getAttribute('checked')?0:1;	// avoid 'undefined' and it became 'NaN'
		$('restoreBtn').image = [Pref.ICON_LOCKED, Pref.ICON_UNLOCK][Pref.isReady2Restore];	// will locked
	},

	// restore the default settings. fire create database
	doRestore: function(e){
		if( !Pref.isReady2Restore || e.target.id !== 'restoreBtn' ) return;
		var tree = treeView.treebox;
		tree.rowCountChanged(1, -(Pref.menuItems.length-1) );
		Services.strings.flushBundles();
		DB.createTables();
		Pref.dataLoad();
		Pref.notifyUpdated();
		tree.rowCountChanged(1,   Pref.menuItems.length-1  );
		tree.invalidate();

		$('restoreGuard').setAttribute('checked', true);
		$('restoreBtn').image = Pref.ICON_LOCKED;
		Pref.isReady2Restore = false;

		Pref.notify('boxNotify', 'info', $LOCALE('pref.notify.restorefinished'));
	},

	tabOpenPosChanged: function(e){
		var T = e.target;
		$('openTabActivate' + T.id.charAt(T.id.length-1)).disabled = !(T.value === '0' || T.value === '1');
	},

	// create a key text for display from entered key strokes
	capturekey: function(e){
		if( [9, 16, 17, 18].indexOf(e.keyCode) > -1 ) return;	// tab, shift, ctrl, alt
		e.preventDefault();

		var modifier = '';
		if(e.ctrlKey)  modifier += 'ctrl + ';
		if(e.shiftKey) modifier += 'shift + ';
		if(e.altKey)   modifier += 'alt + ';

		// こんな感じになる  :  shift + alt + Q
		// 非表示文字はこんな:  ctrl + RETURN
		e.target.value = modifier + EventKey[e.keyCode].replace('VK_', '');
	},
	
	// open sub dialog with parameters. returns last contents.
	changeInSubDialog: function(argObj){
		document.documentElement.openSubDialog(
			'chrome://clicklessmenu/content/scriptEditor.xul',
			'resizable,chrome,dialog=yes,centerscreen,modal=yes',
			argObj
		);
		return ( argObj.edited ? argObj.result : argObj.arg);
	},

	openCodeLibrary: function(){ $('codeLibrary').value = Pref.changeInSubDialog({ arg: $('codeLibrary').value }); },
};

// interchange. {DOM_VK_CONTROL : 17} -> {17 : VK_CONTROL}
// キーストロークから表示用の文字列を取り出す用
var EventKey = {};
for(var p in window.KeyEvent) EventKey[ window.KeyEvent[p] ] = p.replace('DOM_', '');


// associate field-id with db-column#
var VIEW_COL_MAP = {
	icon     : 'favicon',
	name     : 'name',
	url      : 'url_script',
	isScript : 'isScript',
	delete   : 'delete'
};


var treeView = {
	// initialise & terminate tree
	setTree: function(treebox){ (treebox) ? this.treebox = treebox : Pref.menuItems = undefined; },

	get rowCount() { return Pref.menuItems.length; },

	getCellText : function(row,col){
		if( col.id === 'name' || col.id === 'url' ) return Pref.menuItems[row][ VIEW_COL_MAP[col.id] ];
	},

	//  0:false  /  1:true
	getCellValue : function(row,col){ return ( (col.id === 'isScript') && (Pref.menuItems[row].isScript === 1) ); },

	isSeparator: function(row){ return (Pref.menuItems[row].url_script === '<separator>'); },

	isEditable: function(row, col) {
		return !( col.id === 'delete'
			||    col.id === 'icon'
			||  ( col.id === 'url' && Pref.menuItems[row].isScript === 1 )
			||  ( col.id !== 'url' && this.isSeparator(row) )
			||  ( col.id !== 'url' && col.id !== 'name' && row === Pref.menuItems.length-1 )
		);
	},

	setCellText: function(row, col, value){
		// attempt obtain a favicon
		if( treeView.shouldGetFavicon(row, col, value) ) Pref.getFavicon(row, value);

		// further append an item for explain when append new item
		if(row === Pref.menuItems.length-1 && value !== Pref.menuItems[row][ VIEW_COL_MAP[col.id] ] ){
			if(col.id === 'name') Pref.menuItems[row].url_script = null;	// over write explanation
			Pref.appendExplainItem();

			var newIdx = this.rowCount - 1;
			this.treebox.rowCountChanged(newIdx, 1);
			this.treebox.ensureRowIsVisible(newIdx);
			this.treebox.treeBody.focus();
		}

		Pref.menuItems[row][ VIEW_COL_MAP[col.id] ] = value;
		this.treebox.invalidate();
	},

	// get the favicon when URL are edited. except no changes or 'isScript' is true
	shouldGetFavicon: function(row, col, value){
		return( ( col.id === 'url' )
			 && ( value  !== Pref.menuItems[row][ VIEW_COL_MAP[col.id] ] ) 
			 && ( 0      === Pref.menuItems[row].isScript )
		);
	},

	setCellValue: function(row, col, value){
		Pref.menuItems[row].isScript = (value === 'true')?1:0;
		this.treebox.invalidate();
	},

	getImageSrc: function(row,col){ return ( Pref.menuItems[row][ VIEW_COL_MAP[col.id] ]) },

	dragStart: function(e){
		var sourceIdx = treeView.selection.currentIndex;
		if( sourceIdx === Pref.menuItems.length -1 ) return;	// last item (explain) is not movable
		e.dataTransfer.setData('text/x-moz-tree-index', sourceIdx);
		e.dataTransfer.dropEffect = 'move';
	},

	canDrop: function(targetIdx, orientation, dataTransfer){
		var curIdx = treeView.selection.currentIndex;
		return ( dataTransfer.types.contains('text/x-moz-tree-index')
			  && curIdx    !== -1
			  && curIdx    !== targetIdx
			  && curIdx    !== (targetIdx + orientation)
			  && targetIdx !== Pref.menuItems.length-1
		);
	},

	drop: function(targetIdx, orientation, dataTransfer){
		if( !this.canDrop(targetIdx, orientation, dataTransfer) ) return;

		// change index either up or down
		var sourceIdx = treeView.selection.currentIndex;
		(sourceIdx < targetIdx)
			? (orientation === Ci.nsITreeView.DROP_BEFORE && targetIdx--)
			: (orientation === Ci.nsITreeView.DROP_AFTER  && targetIdx++)
		;
		if( targetIdx < 0 || targetIdx > this.rowCount -1 ) return;	// over!

		// once remove from original array, and re-insert it to a new position
		var removedItems = Pref.menuItems.splice(sourceIdx, 1);
		Pref.menuItems.splice(targetIdx, 0, removedItems[0]);

		this.treebox.invalidate();
		this.selection.clearSelection();
		this.selection.select(targetIdx);
		this.treebox.ensureRowIsVisible(targetIdx);
		this.treebox.treeBody.parentNode.focus();
	},

	// helper for extract position of mouse pointer on tree
	getCell: function(e){
		var irow = {}, icol = {}, ipart = {};
		this.treebox.getCellAt(e.clientX, e.clientY, irow, icol, ipart);
		return {row: irow, col: icol, part: ipart};
	},

	// capture (single)click event on tree object. change icon or delete row button
	clicked : function(e){
		var {row, col, part} = this.getCell(e);
		if( !col.value || row.value === Pref.menuItems.length-1 ) return;

		switch(col.value.id){
			case 'delete' : this.removeObjectAt(row.value);	break;
			case 'icon'   : this.useLocalIcon(row);			break;
		}
	},

	removeObjectAt: function(index){
		Pref.menuItems.splice(index, 1);
		this.treebox.rowCountChanged(index, -1);
		this.selection.clearSelection();
	},

	useLocalIcon: function(row){
		if( this.isSeparator(row.value) ) return;
		var loadedImage = Pref.loadLocalIcon();
		if(loadedImage) Pref.menuItems[row.value].favicon = loadedImage;
	},

	// capture (double)click event on tree object. open script editor when isScript is true
	dblclicked: function(e){
		var {row, col, part} = this.getCell(e);
		if(!col.value || row.value === Pref.menuItems.length-1) return;

		if( col.value.id === 'url' && Pref.menuItems[row.value].isScript )
			Pref.menuItems[row.value].url_script = Pref.changeInSubDialog({ arg: Pref.menuItems[row.value].url_script });
	},

	// capture mousemove event on tree object. change color of delete button icon
	moveCursor: function(e){
		var {row, col, part} = this.getCell(e);
		if(!col.value) return ;

		Pref.fillIconGlay();
		if(col.value.id === 'delete') Pref.menuItems[row.value].delete = Pref.ICON_DEL_RED;
		Pref.menuItems[Pref.menuItems.length-1].delete = null;	// row of explain item always not display delete button icon
	},

	getCellProperties: function(row,col,props){
		if( row === Pref.menuItems.length-1 ){	// 'Edit here to add new item.' is grayed out
			if(props) props.AppendElement(Cc['@mozilla.org/atom-service;1'].getService(Ci.nsIAtomService).getAtom('newItem'));	// ff15-21
			return 'newItem';	// ff22->
		}
	},

	getLevel: dummyF,
	isSorted: dummyF,
	cycleHeader: dummyN,
	isContainer: dummyF,
	stopEditing: dummyN,
	getRowProperties: dummyN,
	getColumnProperties: dummyN,
	getParentIndex: function(rowIndex) { return -1; },
};
