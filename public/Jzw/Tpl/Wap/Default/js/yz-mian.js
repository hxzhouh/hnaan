$(function(){
	//首页banner轮播
	var swiper = new Swiper('.index-banner', {
     	 autoplay:true,
    	loop:true,
      pagination: {
        el: '.swiper-pagination',
      },
    });
	
	/*点击展开侧导航*/
	$('.xiala').click(function(){
		$('.ce-nav').show();
		 $(".nav").animate({right:'40%'});
	});
	//侧导航二级菜单控制
	$('.nav-ul li').click(function(){
		$(this).children("ul").slideToggle();
	});
	
	/*点击进行影藏*/
	$('.ce-nav').click(function(){
		$(this).hide();
		$(".nav").animate({right:'0%'});
	});
	/*置顶*/
	$('.zhiding').hide();
	goTopEx();
	
	
	$(".index-case-head span").click(function(){
		$(".index-case-main>div").hide();
		$(".index-case-head span").removeClass("active");
		$(this).addClass("active");
	})
	$(".index-case-head span:nth-child(1)").click(function(){$(".index-case-main>div:nth-child(1)").show();});
	$(".index-case-head span:nth-child(2)").click(function(){$(".index-case-main>div:nth-child(2)").show();});
	$(".index-case-head span:nth-child(3)").click(function(){$(".index-case-main>div:nth-child(3)").show();});
	$(".index-case-head span:nth-child(4)").click(function(){$(".index-case-main>div:nth-child(4)").show();})
	
	$(".index-youshi-head>div").click(function(){
		$(".index-youshi>div").hide();
		$(".index-youshi-head>div").removeClass("active");
		$(this).addClass("active");
	})
	$(".index-youshi-head>div:nth-child(1)").click(function(){$(".index-youshi>div:nth-child(1)").show();});
	$(".index-youshi-head>div:nth-child(2)").click(function(){$(".index-youshi>div:nth-child(2)").show();});
	$(".index-youshi-head>div:nth-child(3)").click(function(){$(".index-youshi>div:nth-child(3)").show();});
	$(".index-youshi-head>div:nth-child(4)").click(function(){$(".index-youshi>div:nth-child(4)").show();});
	
	
	$(".news-index2").hide();
	$(".index-news-head>span").click(function(){
		$(".index-news").hide();
		$(".index-news-head>span").removeClass("active");
		$(this).addClass("active");
	})
	$(".index-news-head>span:nth-child(1)").click(function(){$(".news-index1").show();});
	$(".index-news-head>span:nth-child(2)").click(function(){$(".news-index2").show();});
	
	
	
	
	 
    
    
    $(".case-swiper .swiper-slide").click(function(){
		$(".case-swiper .swiper-slide").removeClass("active");
		$(this).addClass("active");
	})
    
    var swiper5 = new Swiper('.qibu-swiper', {
      slidesPerView: 1.1,
      spaceBetween: 15,
    });
    
    
    setTimeout(function(){
		var swiper6 = new Swiper('.bs-gongyi-swiper', {
			slidesPerView: 2,
			spaceBetween: 10,
			slidesPerGroup: 2,
	        pagination: {
	        	el: '.swiper-pagination',
	        },
	    });
    },100)
    
    var swiper7 = new Swiper('.bs-zz-swi', {
      slidesPerView: 1.2,
      spaceBetween: 15,
      pagination: {
        el: '.swiper-pagination',
      },
    });
    
    
    
    
    
    
    
	
	
	
	setTimeout(function(){
	var swiper3 = new Swiper('.yiwei', {
		spaceBetween: 30,
						pagination: {
						el: '.yiwei-jianjie',
						},
					});
	},100)

	setTimeout(function(){
	var swiper4 = new Swiper('.xiaoyuan', {
		spaceBetween: 30,
						pagination: {
						el: '.xiaoyuan-jianjie',
						},
					});
	},100)
	
			var swiper60 = new Swiper('.sj-con', {
				spaceBetween: 30,
      slidesPerView: 2.5,
      spaceBetween: 40,
    });
	
	
});
