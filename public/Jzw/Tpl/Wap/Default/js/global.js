// JavaScript Document
$(function(){
	var qq = 1594687287,tel = "13973183738";
	if(is_WX())
	{
		wap_url = "http://wpa.qq.com/msgrd?v=3&uin="+ qq +"&site=qq&menu=yes";
	}else{
		wap_url = "mqqwpa://im/chat?chat_type=wpa&uin="+ qq +"&version=1&src_type=web&web_src="+ window.location.host
	}
	$(".address_text").text("长沙高新区同心工业园4栋5楼501");
	$(".mobile_text").text("18390972868");
	$(".tel_text").text("13973183738");
	$(".freetel_text").text("400-0731-050");
	$(".fax_text").text("13973183738");
	$(".email_text").text("1594687287@qq.com");
	$(".WAP_LINK_TEL").attr("href","tel:"+ tel);
	$(".WAP_LINK_KF").attr("href",wap_url).attr("target","_blank");	
	if($(".swiper-wrapper li").size() <=1){
		$(".swiper-pagination").hide();	
	}
	initEvent();
	$(".btnlist").each(function(idx,item){
		$(item).children().eq(0).addClass("cur");	
		if(!!$(this).attr("rel"))
		{
			$($(this).attr("rel")).children().eq(0).show();
		}
	});
	$(".btnlist").children().bind("touchstart click",function(){
		if($(this).is(".cur")){return false;}
		var parent = $(this).parent();
		var obj_box= $($(this).parent().attr("rel"));
		var index  = parent.children().index(this);
		parent.find(".cur").removeClass("cur");
		$(this).addClass("cur");
		obj_box.children().hide();
		obj_box.children().eq(index).stop().fadeIn();
		return false;
	});
	if($(".swiper1 li").size() <=1){
		$(".swiper-pagination").hide();	
	}
});

function initEvent()
{
	$("body").bind("touchstart click",function(e){
		if($(e.target).parents(".downmenu").size()<= 0){
			$("html").removeClass("active");
		}
	});
	$(".btn_menu").bind("touchstart click",function(e){
		e.preventDefault();
		if($("html").is(".active")){
			$("html").removeClass("active");
		}else{
			$("html").addClass("active");
		}
		return false;
	});	
}

function LoadCommentsCount(cid,type,url)
{
	//增加一次点击,并提取评论统计
	times = new Date().getSeconds();
	$.get("/zx_inc/zx_ajax.asp", { time: times, CommentID: cid, action: 'LoadCommentsCount', Ctype:type},
	function(data){
		if(data.result == "sucess")
		{
			//$(".msgtotal").html(data.count);
			$(".visits").html(data.hits);
		}
	}, "json");
}

//提交评论
function CheckMessage(frm,obj,url)
{
	var nickname= $(frm).find("#nickname").val() || "";
	var contact = $(frm).find("#contact").val() || "";
	var qq    = $(frm).find("#qq").val() || "";
	if(nickname.replace(/\s/ig,'')==""){
		alert("请填写您的姓名");
		$(frm).find("#nickname").focus();
		return false;
	}
	if(!RegExpTest("^(1[3|4|5|8]\\d{9})|(0\\d{2,3}(-)?\\d{7,8})$",contact))
	{
		alert("请填写填写正确的联系电话");
		$(frm).find("#contact").focus();
		return false;
	}
	$(obj).prop("disabled",true);
	times = new Date().getTime();

	$.post("/zx_inc/zx_ajax.asp", { time: times, action: 'SendMessage', NickName:nickname, Contact:contact, type:3},
	function(data){
		if(data.result=="error")
		{
			if(data.errMode==1){
				alert("无法提交,请与管理员联系");
			}else{
				alert("提交失败，请检查资料填写是否正确");	
			}
		}
		else
		{
			resetForm(frm);
			alert("提交成功");
		}
		$(obj).prop("disabled",false);
	},"json");
}

function resetForm(objForm){
	$(objForm).find("input[type='text'],textarea").val("");
}

function Do_getProduct(pagesize,page,chnid)
{
	//提取评论信息
	times = new Date().getSeconds();
	$.get("/zx_inc/zx_ajax.asp", { time: times, pagesize: pagesize, pager:page, chnid:chnid, action: 'GetProduct'},
	function(data){
		if(data.result == "success")
		{
			if(data.count <= 0){alert("没有了");$("#loadMore").hide();return false;}
			var html = "";
			var source   = $("#entry-template").html();
			var counter = 1;
			if((pagesize%2) == 1){counter = 0;}
			$.each(data.content,function(idx,item){
				var template    = Handlebars.compile(source);
				html = html + template(item).replace("{$_index_$}",counter%2);
				counter ++ ;
			});
			$("#container").append(html);
		}
	}, "json");
}

function is_WX() {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.match(/Mobile/i) == "mobile" && ua.match(/MicroMessenger/i) == "micromessenger") {
        return true;
    } else {
        return false;
    }
}

//正则表达式匹配函数
function RegExpTest(patt,str)
{
	var regexp = new RegExp(patt);
	if(regexp.test(str))
	{
		return true;
	}
	else
	{
		return false;
	}
}
