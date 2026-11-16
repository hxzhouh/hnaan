// JavaScript Document
function wapredirect(f) {
	var url   = document.referrer;
	if(url!="")
	{
		if(url.indexOf(location.host) > 0)
		{
			return false;	
		}
	}
	if ((navigator.userAgent.match(/(iPhone|iPod|Android|ios|SymbianOS|Windows Phone|Nokia)/i))) {
		location.replace(f)
	}
}

function pcredirect(f) {
	  if (!(navigator.userAgent.match(/(iPhone|iPod|Android|ios|SymbianOS|Windows Phone|Nokia)/i))) {
		  location.replace(f)
	  }
}