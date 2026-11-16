var pc_menuid = 0;
var nopicpath = "/Jzw/Tpl/Home/Default/Public/nopic.jpg"; //默认图片
$(function () {
    //显示默认图片
    $(".pics").find("img").each(function () {
        if ($(this).attr("src") == "") {
            $(this).attr("src", nopicpath);
        }
    });
});
//客服链接统一打开
//放置model_foot.html
//<a style="display:none;" id="aFootKefu" href="http://wpa.qq.com/msgrd?v=3&uin={$qq}&site={$site_name}&menu=yes"></a>
function sayKeFu() {
    var path = $("#aFootKefu").attr("href");
    var newTab = window.open('about:blank');
    $.ajax({
        success: function (data) {
            if (data) {
                newTab.location.href = path;
            }
        }
    });
}
//提交留言
function submitMessage(dataValue, method, callback) {
   
    $.ajax({
        url: "/index.php?g=Home&m=Index&a=" + method,
        type: "get",
        data: dataValue,
        dataType: "text",
        success: function (result) {
            if (result == "ok") {
                callback();
              
            } else {
                alert(result);
            }
        },
        error: function () { }
    });
}


//加载联系我们地图PC
//调用方式
//loadContactMap('content','{$site_name}','{$address}','{$tel}','{$baiduxy}'.split(',')[0],'{$baiduxy}'.split(',')[1]);
function loadContactMap_bak(id, site_name, address, tel, bdx, bdy) {
    var map = new BMap.Map(id);
    var point = new BMap.Point(bdx, bdy);
    map.centerAndZoom(point, 15);
    var marker = new BMap.Marker(point); // 创建标注
    map.addOverlay(marker);
    var opts = {
        width: 300, // 信息窗口宽度
        height: 80, // 信息窗口高度
        title: "<b style='color:#d00'>" + site_name + "</b>" // 信息窗口标题
    }
    var infoWindow = new BMap.InfoWindow(
        "<font style='font-size:12px;'>地址：" + address + "<br/>联系电话：" + tel + "</font>", opts); // 创建信息窗口对象
    map.openInfoWindow(infoWindow, map.getCenter()); // 打开信息窗口
    map.addControl(new BMap.NavigationControl());
    map.enableScrollWheelZoom();
}

// =============================================百度地图=================================================
var baiduMap;
//加载联系我们地图PC
function loadContactMap(id, markerArr, map) {
    baiduMap = map;
    baiduMap.enableScrollWheelZoom(true);
    //向地图中添加缩放控件
    var ctrlNav = new window.BMap.NavigationControl({ anchor: BMAP_ANCHOR_TOP_LEFT, type: BMAP_NAVIGATION_CONTROL_LARGE });
    baiduMap.addControl(ctrlNav);
    //向地图中添加缩略图控件
    var ctrlOve = new window.BMap.OverviewMapControl({ anchor: BMAP_ANCHOR_BOTTOM_RIGHT, isOpen: 1 });
    baiduMap.addControl(ctrlOve);
    //向地图中添加比例尺控件
    var ctrlSca = new window.BMap.ScaleControl({ anchor: BMAP_ANCHOR_BOTTOM_LEFT });
    baiduMap.addControl(ctrlSca);
    //绘制点
    for (var i = 0; i < markerArr.length; i++) {
        var point = markerArr[i].point.value;
        addInfoWindow(addMarker(new window.BMap.Point(point.split(",")[0], point.split(",")[1]), i), markerArr[i], i);
    }
}

function addMarker(point, index) {
    var myIcon = new BMap.Icon("http://api.map.baidu.com/img/markers.png", new BMap.Size(23, 25), { offset: new BMap.Size(10, 25), imageOffset: new BMap.Size(0, 0 - index * 25) });
    var marker = new BMap.Marker(point, { icon: myIcon });
    baiduMap.addOverlay(marker);
    return marker;
}
// 添加信息窗口
function addInfoWindow(marker, poi) {
    //pop弹窗标题
    var title = '<div id="map_title_my">' + poi.title.value + '</div>';
    //pop弹窗信息
    var htmlStr = [];
    var telStr = 'tel' in poi ? '<tr><td>' + poi.tel.name + ':</td><td>' + poi.tel.value + '</td></tr>' : '';
    htmlStr.push('<table cellspacing="0" id="map_content_my"><tbody>' +
        '<tr><td>' + poi.address.name + ':</td><td>' + poi.address.value + '</td></tr>' + telStr +
        '</tbody></table>');
    var infoWindow = new BMap.InfoWindow(htmlStr.join(""), { title: title, width: 200 });

    var openInfoWinFun = function () { marker.openInfoWindow(infoWindow); };
    marker.addEventListener("click", openInfoWinFun);
    baiduMap.openInfoWindow(infoWindow, baiduMap.getCenter());
    return openInfoWinFun;
}
// =============================================百度地图 END=================================================


//动态加载单表数据
function loadData(table, nowPage, catids, size) {
    myajax("/index.php?g=Wap&m=Index&a=getData", {
        table: table,
        catids: catids,
        nowPage: nowPage,
        size: size
    }, "json", "get", getData);
}
//=======================================通用JS========================================

// 封装Ajax调用 需引用layer.js和layer.css
// <link rel=stylesheet href="/Public/Js/layer/skin/layer.css">
// <script src="/Public/Js/layer/layer.js"></script>
var ajaxLoadIndex;

function myajax(url, data, dataType, type, responseFun) {
    $.ajax({
        url: url,
        data: data,
        dataType: dataType,
        type: type,
        success: responseFun,
        beforeSend: beforeSend,
        error: error
    });
}

function beforeSend() {
    //加载层
    // ajaxLoadIndex = layer.load(0, {
    //     shade: false
    // });
}

function error() {
    //提示层
    layer.msg('请求失败'); //layerUI
}
//封装ajax end