var { interfaces: Ci, utils: Cu } = Components;
Cu.import('resource://gre/modules/Services.jsm', this);

var EXPORTED_SYMBOLS = ['DB', '$LOCALE'];

//var logdb = function(msg){ dump( new Date().toString().substring(16,24) + ' |  D| ' + msg + '\n' ); }

var DB = {
	file: null,
	conn: null,

	// atache .sqlite file or create it and tables
	init: function(){
		if(DB.file) return;

		DB.file = Services.dirsvc.get('ProfD', Ci.nsIFile);
		DB.file.append('clicklessmenu.sqlite');

		var tableCount = DB.getItemsMap(
			DB.getConnection().createStatement("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='prefs';")
		)[0]['count(*)'];

//		logdb('tableCount ' + tableCount);
		if( tableCount === 0) DB.createTables();
	},

	destroy: function(){
		if(( DB.conn && DB.conn.connectionReady )) DB.conn.close();
		DB.file = DB.conn = null;
	},

	getConnection: function(){
		return ( DB.conn && DB.conn.connectionReady )
			? DB.conn
			: DB.conn = Services.storage.openDatabase(DB.file);
	},

	// create tables from property files that defaultSql.properties and clicklessmenu.properties
	createTables: function(){
		var conn = DB.getConnection();
		var sqlBundle = Services.strings.createBundle('chrome://clicklessmenu/content/defaultSql.properties');

		// DROP & CREATE
		var DDL_KEYS = ['sql.drop.table.links', 'sql.create.table.links', 'sql.drop.table.prefs', 'sql.create.table.prefs'];
		for(var i=0, iLim=DDL_KEYS.length; i<iLim; i++) conn.executeSimpleSQL( sqlBundle.GetStringFromName(DDL_KEYS[i]) );

		// INSERT
		var sqlEnum = sqlBundle.getSimpleEnumeration();
		while( sqlEnum.hasMoreElements() ){
			let sqlProp = sqlEnum.getNext().QueryInterface(Ci.nsIPropertyElement);
			if( DDL_KEYS.indexOf(sqlProp.key) > -1 ) continue;	// exclude DDL_KEYS

			// localize. Varies depending on the definition of replacers
			let sql;
			try{
				let localizedArray = $LOCALE(sqlProp.key).split('__DELM__');
				sql = sqlBundle.formatStringFromName(sqlProp.key, localizedArray, localizedArray.length);
			}catch(e){
				sql = sqlBundle.GetStringFromName( sqlProp.key );
			}
			conn.executeSimpleSQL(sql);
		}

		DB.conn.asyncClose();
	},

	// helper at set values to update sql
	bindPrms: function( statement, idx, param ){
		switch( typeof param ){
			case 'string' : statement.bindUTF8StringParameter(idx, param); break;
			case 'number' : statement.bindInt32Parameter(idx, param);      break;
			default       : statement.bindNullParameter(idx);              break;
		}
	},

	// helper at extract return values from statement
	getValByType: function(statement, idx){
		switch( statement.getTypeOfIndex(idx) ){
			case statement.VALUE_TYPE_TEXT    : return statement.getUTF8String(idx); break;
			case statement.VALUE_TYPE_INTEGER : return statement.getInt32(idx);      break;
			case statement.VALUE_TYPE_NULL    : return null;                         break;
		}
	},

	// execute query and return a array of KV map. [ {id, name, ...}, {id, name, ...} ]
	getItemsMap: function(statement){
		var resultMaps = [];
		var recordIndex = 0;
		while( statement.executeStep() ){
			var aRecordMap = {};
			for(var j=0, colCt=statement.columnCount; j<colCt; j++) aRecordMap[statement.getColumnName(j)] = DB.getValByType(statement, j);
			resultMaps[recordIndex++] = aRecordMap;
		}
		statement.finalize();
		return resultMaps;
	},

	// execute query and return KV map. {k, v}
	getPrefMap: function(statement){
		var resultArrays = {};
		while( statement.executeStep() ){
			for(var j=0, colCt=statement.columnCount; j<colCt; j+=2)
				resultArrays[DB.getValByType(statement, j)] = DB.getValByType(statement, j+1);
		}
		statement.finalize();
		return resultArrays;
	},

	// execute query for each item
	bindAndExecute: function(statement, items){
		items.forEach( function(row, ridx){
			row.forEach( function(col, cidx){ DB.bindPrms(statement, cidx, col); } );
			statement.execute();
			statement.reset();
		} );
		statement.finalize();
	},

	// helper at select a item
	getRecordById: function(sqlString, id){
		var statement = DB.getConnection().createStatement(sqlString);
			statement.bindUTF8StringParameter(0, id);
		return DB.getItemsMap(statement)[0];
	},

	// update all menu data. once delete links table and re-insert.
	// id, name, isScript, url_script, xpath, width, height, posx_def, posy_def, posx_min, posy_min, favicon
	updateMenuData: function(menuItems){
		DB.getConnection().executeSimpleSQL("DELETE FROM links;");
		var statement = DB.getConnection().createStatement(
			"INSERT INTO links VALUES (?1, ?2, ?3, ?4, ?5);");
		DB.bindAndExecute(statement, menuItems);
	},

	// get all records from links
	getMenuData: function() {
		return DB.getItemsMap( DB.getConnection().createStatement("SELECT id, name, url_script, isScript, favicon FROM links") );
	},

	// get 'url_script' and 'isScript' columns from links by id
	getUrlScriptById: function(id){
		return DB.getRecordById("SELECT url_script, isScript FROM links WHERE id=?1", id);
	},


	////////  for prefs /////////////
	getPrefs: function(){
		var statement = DB.getConnection().createStatement("SELECT key, value FROM prefs;");
		var prefs = DB.getPrefMap(statement);
		return prefs;
	},
	updatePrefs: function(items){
		var statement = DB.getConnection().createStatement("UPDATE prefs SET value=?2 WHERE key=?1;");
		DB.bindAndExecute(statement, items);
	},

};

var $LOCALE = function(key){
	b = Services.strings.createBundle('chrome://clicklessmenu/locale/clicklessmenu.properties');
	return function(key){ return b.GetStringFromName(key); };
}();
