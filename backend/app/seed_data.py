"""台灣最多人去的潛點固定清單（第一層 MVP）。

座標取各地區主要下水點附近；`cwa_marine_zone` 對應中央氣象署「沿岸海域天氣預報」
的分區名稱，`cwa_tide_station` 對應潮汐預報站，供第二步接 API 用。
清單之後要擴充，直接改這裡再跑 `python -m app.seed` 即可。
"""

from __future__ import annotations

LOCATIONS: list[dict] = [
    {
        "slug": "xiaoliuqiu",
        "name": "小琉球",
        "name_en": "Xiaoliuqiu (Lamay Island)",
        "region": "屏東 · 離島",
        "blurb": "全台最容易看到海龜的珊瑚礁島，全年可潛，適合初學者與浮潛。",
        "spots": ["花瓶石", "美人洞", "厚石群礁", "龍蝦洞", "杉福漁港"],
        "activities": ["scuba", "freedive", "snorkel"],
        "lat": 22.342,
        "lon": 120.377,
        "cwa_marine_zone": "臺灣海峽南部",
        "cwa_tide_station": "屏東縣琉球鄉",
    },
    {
        "slug": "lyudao",
        "name": "綠島",
        "name_en": "Green Island",
        "region": "臺東 · 離島",
        "blurb": "能見度極佳的火山島，硬珊瑚覆蓋率高，石朗、大白沙為熱門岸潛點。",
        "spots": ["石朗", "大白沙", "柴口", "鋼鐵礁", "睡美人與哈巴狗"],
        "activities": ["scuba", "freedive", "snorkel"],
        "lat": 22.657,
        "lon": 121.492,
        "cwa_marine_zone": "臺灣東南部海面",
        "cwa_tide_station": "臺東縣綠島鄉",
    },
    {
        "slug": "lanyu",
        "name": "蘭嶼",
        "name_en": "Orchid Island",
        "region": "臺東 · 離島",
        "blurb": "黑潮流經、生態原始的離島，地形潛與大洋洄游魚種豐富，適合進階者。",
        "spots": ["八代灣", "玉女岩", "雙獅岩", "母雞岩", "軍艦岩"],
        "activities": ["scuba", "freedive"],
        "lat": 22.043,
        "lon": 121.539,
        "cwa_marine_zone": "臺灣東南部海面",
        "cwa_tide_station": "臺東縣蘭嶼鄉",
    },
    {
        "slug": "kenting-houbihu",
        "name": "墾丁 · 後壁湖",
        "name_en": "Kenting / Houbihu",
        "region": "屏東 · 恆春半島",
        "blurb": "交通最方便的潛點，後壁湖出水口有大量熱帶魚，適合體驗潛水與教學。",
        "spots": ["後壁湖", "出水口", "萬里桐", "香蕉灣", "眺石"],
        "activities": ["scuba", "freedive", "snorkel"],
        "lat": 21.943,
        "lon": 120.745,
        "cwa_marine_zone": "巴士海峽",
        "cwa_tide_station": "屏東縣恆春鎮",
    },
    {
        "slug": "longdong",
        "name": "東北角 · 龍洞",
        "name_en": "Longdong",
        "region": "新北 · 東北角",
        "blurb": "北台灣最大岸潛場，四稜砂岩地形、灣內平靜，是潛水課與自潛練習的主場。",
        "spots": ["龍洞灣", "和美", "鼻頭角", "卡蜜克岩", "四季灣"],
        "activities": ["scuba", "freedive"],
        "lat": 25.109,
        "lon": 121.922,
        "cwa_marine_zone": "臺灣北部海面",
        "cwa_tide_station": "新北市貢寮區",
    },
    {
        "slug": "penghu",
        "name": "澎湖",
        "name_en": "Penghu",
        "region": "澎湖 · 離島",
        "blurb": "玄武岩地形與軟珊瑚聞名，夏季風平浪靜，山水、龍門一帶也有穩定浪點。",
        "spots": ["山水", "龍門", "東海諸島", "藍洞", "小門鯨魚洞"],
        "activities": ["scuba", "freedive", "snorkel", "surf"],
        "lat": 23.565,
        "lon": 119.616,
        "cwa_marine_zone": "澎湖海面",
        "cwa_tide_station": "澎湖縣馬公市",
    },
]
