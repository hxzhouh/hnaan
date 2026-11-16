// The supplied page already contains jCarousel's rendered grid and wrappers.
// Keep that layout and support its existing previous/next callbacks without wrapping it again.
(function($){if(!$||$.fn.jcarousel)return;$.fn.jcarousel=function(options){return this.each(function(){const list=$(this);const carousel={prev(){const last=list.children().last();if(last.length)list.prepend(last);},next(){const first=list.children().first();if(first.length)list.append(first);}};if(options&&options.initCallback)options.initCallback(carousel);});};})(window.jQuery);
