$(function(){
	new WOW().init();
jQuery(".slideBox").slide({mainCell:".bd ul",autoPlay:true,delayTime:500});	
$('.dzinb-bottom-left li').click(function(){
	$('.fenlei').hide();
});
$('.dzinb-bottom-left li:nth-child(1)').click(function(){
	$('.fenlei:nth-child(1)').show();
});
$('.dzinb-bottom-left li:nth-child(2)').click(function(){
	$('.fenlei:nth-child(2)').show();
});
$('.dzinb-bottom-left li:nth-child(3)').click(function(){
	$('.fenlei:nth-child(3)').show();
});
$('.dzinb-bottom-left li:nth-child(4)').click(function(){
	$('.fenlei:nth-child(4)').show();
});
$('.dzinb-bottom-left li:nth-child(5)').click(function(){
	$('.fenlei:nth-child(5)').show();
});
$('.dzinb-bottom-left li:nth-child(6)').click(function(){
	$('.fenlei:nth-child(6)').show();
});
$('.dzinb-bottom-left li:nth-child(7)').click(function(){
	$('.fenlei:nth-child(7)').show();
});
$('.dzinb-bottom-left li:nth-child(8)').click(function(){
	$('.fenlei:nth-child(8)').show();
});
$('.dzinb-bottom-left li:nth-child(9)').click(function(){
	$('.fenlei:nth-child(9)').show();
});
$('.dzinb-bottom-left li:nth-child(10)').click(function(){
	$('.fenlei:nth-child(10)').show();
});
$('.aiaoni').click(function(){
	$('.zhengzai-bot-left-bot-in').hide();
});
$('.aiaoni:nth-child(1)').click(function(){
	$('.zhengzai-bot-left-bot-in:nth-child(1)').show();
});
$('.aiaoni:nth-child(2)').click(function(){
	$('.zhengzai-bot-left-bot-in:nth-child(2)').show();
});

$('.nav-in li').hover(function(){
		$(this).find('.nav-in-in').stop(true,true).slideDown();
	},function(){
		$(this).find('.nav-in-in').stop(true,true).slideUp();
})

$('.dzinb-bottom-left li').click(function(){
	$('.dzinb-bottom-left li').removeClass('bs-active');
	$(this).addClass('bs-active');
})

$('.aiaoni').click(function(){
	$('.aiaoni').removeClass('zz-active');
	$(this).addClass('zz-active');
})
	/*测导航动画效果*/
	$('.ce-nav li').hover(function(){
		$(this).children("div").stop().animate({right:'110px'});
	},function(){
		$(this).children("div").stop().animate({right:'-200%'});
	});
$('#gotop').click(function(){$('html,body').animate({scrollTop: '0px'}, 800);return false;});

	$('.dz-i-t-i:nth-child(1)').addClass("bounceInLeft");
	$('.dz-i-t-i:nth-child(2)').addClass("bounceInUp");
	$('.dz-i-t-i:nth-child(3)').addClass("bounceInUp");
	$('.dz-i-t-i:nth-child(4)').addClass("bounceInRight");


	$(".sheji-in-biaoshi li:nth-child(odd) .biaoshi-left").addClass("slideInLeft");
	$(".sheji-in-biaoshi li:nth-child(odd) .biaoshi-right").addClass("slideInRight");
	
	$(".sheji-in-biaoshi li:nth-child(even) .biaoshi-left").addClass("slideInRight");
	$(".sheji-in-biaoshi li:nth-child(even) .biaoshi-right").addClass("slideInLeft");
	
	$('.chenxin-t-in:nth-child(odd)').addClass("slideInDown");
	$('.chenxin-t-in:nth-child(even)').addClass("slideInUp");
	
	
	$('.zhengzai-bot-left').addClass("bounceInLeft");
	$('.zhengzai-bot-right').addClass("bounceInRight");
	
	
	$('.gyaan-in-left').addClass("bounceInLeft");
	$('.gyaan-in-right').addClass("slideInRight");
	
	
	$(".sheji-in-biaoshi li:nth-child(2n) .biaoshi-right").addClass("biaoshi-right-active");
	

	
	
});



















