(function () {
    'use strict';
    var target = document.getElementById('dituContent');
    var config = document.getElementById('site-map-config');
    if (!target || !config) return;
    var data = JSON.parse(config.textContent);
    // Match the provider's Referer configuration. Alias/preview domains that
    // have not been authorized keep contact guidance without invoking its SDK.
    if (!data.hosts.includes(window.location.hostname)) {
        target.setAttribute('data-map-state', 'unavailable');
        return;
    }
    var finished = false;
    var initialized = false;
    var timer;
    var script;
    var english = data.locale === 'en';
    function fallback() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        window.hnaanMapReady = function () {};
        if (script) script.remove();
        target.textContent = english
            ? 'Map unavailable. Please use the contact details on this page.'
            : '地图暂时无法加载，请查看页面上的联系方式。';
        target.setAttribute('role', 'status');
        target.setAttribute('data-map-state', 'unavailable');
    }
    window.hnaanMapReady = function () {
        if (finished || initialized) return;
        try {
            var api = window.BMap;
            if (!api || !api.Map) return fallback();
            target.textContent = '';
            target.setAttribute('role', 'region');
            target.setAttribute('aria-label', english ? 'Company location' : '公司位置');
            var map = new api.Map(target);
            initialized = true;
            map.addEventListener('tilesloaded', function () {
                if (finished) return;
                target.setAttribute('data-map-state', 'ready');
                finished = true;
                clearTimeout(timer);
            });
            var point = new api.Point(data.longitude, data.latitude);
            map.centerAndZoom(point, 15);
            var marker = new api.Marker(point);
            map.addOverlay(marker);
            map.addControl(new api.NavigationControl());
            map.addControl(new api.ScaleControl());
            map.enableScrollWheelZoom(true);
            var details = document.createElement('div');
            [data.name, (english ? 'Address: ' : '地址：') + data.address,
                (english ? 'Phone: ' : '电话：') + data.phone].forEach(function (text) {
                var line = document.createElement('p');
                line.textContent = text;
                details.appendChild(line);
            });
            var info = new api.InfoWindow(details, { width: 260 });
            marker.addEventListener('click', function () { map.openInfoWindow(info, point); });
            map.openInfoWindow(info, point);
        } catch (_) {
            fallback();
        }
    };
    target.setAttribute('data-map-state', 'loading');
    timer = setTimeout(fallback, 20000);
    script = document.createElement('script');
    // Maintain the existing site's canvas-based map and use HTTPS throughout.
    script.src = 'https://api.map.baidu.com/api?v=3.0&ak=' + encodeURIComponent(data.ak) + '&callback=hnaanMapReady';
    script.async = true;
    script.onerror = fallback;
    document.head.appendChild(script);
}());
