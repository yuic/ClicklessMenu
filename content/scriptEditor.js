var ScriptEditor = {
	userAccept_Win : false,

	load : function(){
		$('editArea').value = window.arguments[0].arg;
	},

	unload : function(){
		if( $isCommittable(ScriptEditor.userAccept_Win) ){
			window.arguments[0].result = $('editArea').value;
			window.arguments[0].edited = true;
		}
		return true;
	},
}
