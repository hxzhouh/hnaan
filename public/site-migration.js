(()=>{
 const en=document.documentElement.lang==='en';
 function localize(){document.querySelectorAll('a[href]').forEach(a=>{if(a.classList.contains('site-language'))return;let href=a.getAttribute('href');if(!href)return;href=href.replace(/^https?:\/\/(www\.)?hnaan\.cn/,'');if(en&&href.startsWith('/')&&!href.startsWith('//')&&!/^\/(en|Uploads|Jzw|Public|api|cms)(\/|$)/.test(href))href='/en'+href.replace(/^\/wap(?=\/|$)/,'');a.setAttribute('href',href)})}
 function send(data,callback){fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.title||data.name||'',phone:data.phone||'',email:data.email||'',message:data.remark||data.message||'',locale:en?'en':'zh-CN'})}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||'Unable to send');callback()}).catch(e=>alert(e.message))}
 window.submitMessage=(data,method,callback)=>send(data,callback);
 window.loadData=(table,nowPage,catids,size=6)=>{
  const params=new URLSearchParams({table,nowPage:String(nowPage),catids,size:String(size),locale:en?'en':'zh-CN'});
  fetch('/api/content?'+params).then(async r=>{if(!r.ok)throw Error('Unable to load content');return r.json()}).then(rows=>{if(typeof window.getData==='function')window.getData(rows.length?rows:null);localize()}).catch(()=>{const el=document.getElementById('clist_more');if(el)el.textContent=en?'Unable to load. Please try again.':'加载失败，请刷新后重试。'});
 };
 window.dosub=()=>{const name=document.getElementById('t_name'),phone=document.getElementById('t_phone');if(!name||!phone)return false;if(!name.value.trim()||!phone.value.trim()){alert(en?'Please enter your name and phone number.':'请填写姓名和联系电话');return false;}send({name:name.value,phone:phone.value,email:document.getElementById('t_email')?.value,message:document.getElementById('t_remark')?.value},()=>{alert(en?'Your message has been sent.':'留言已提交，我们会尽快与您联系。');const form=name.closest('form');if(form)form.reset()});return false;};
 localize();
 document.querySelectorAll('img').forEach(i=>{if(!i.getAttribute('alt'))i.alt='Aiaoni';if(!i.hasAttribute('loading')&&i.getBoundingClientRect().top>innerHeight)i.loading='lazy'});
})();
