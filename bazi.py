# -*- coding: utf-8 -*-
"""八字排盘模块：基于 lunar_python，纯本地计算，不调用任何第三方命理 API。"""
from lunar_python import Solar

STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]
ELEM_STEM = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"]
ELEM_BRANCH = dict(zip(BRANCHES, ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"]))

# 月令五行旺衰：传统命理"月令为提纲"，同一五行在不同季节力量悬殊
# 旺=当令得气(权重1.5)、相=次旺(1.2)、休=退休(0.8)、囚=被克(0.5)、死=受克最弱(0.3)
# 参考《渊海子平》《三命通会》十二月令用事
SEASON_STRENGTH = {
    # 春(寅卯辰):木旺火相水休金囚土死
    "寅": {"木": 1.5, "火": 1.2, "水": 0.8, "金": 0.5, "土": 0.3},
    "卯": {"木": 1.5, "火": 1.2, "水": 0.8, "金": 0.5, "土": 0.3},
    "辰": {"木": 1.2, "火": 1.0, "水": 0.8, "金": 0.6, "土": 1.5},  # 辰月土旺(土寄库)
    # 夏(巳午未):火旺土相木休水囚金死
    "巳": {"火": 1.5, "土": 1.2, "木": 0.8, "水": 0.5, "金": 0.3},
    "午": {"火": 1.5, "土": 1.2, "木": 0.8, "水": 0.5, "金": 0.3},
    "未": {"火": 1.2, "土": 1.5, "木": 0.8, "水": 0.6, "金": 0.5},  # 未月土旺
    # 秋(申酉戌):金旺水相土休火囚木死
    "申": {"金": 1.5, "水": 1.2, "土": 0.8, "火": 0.5, "木": 0.3},
    "酉": {"金": 1.5, "水": 1.2, "土": 0.8, "火": 0.5, "木": 0.3},
    "戌": {"金": 1.2, "水": 1.0, "土": 1.5, "火": 0.6, "木": 0.5},  # 戌月土旺
    # 冬(亥子丑):水旺木相金休土囚火死
    "亥": {"水": 1.5, "木": 1.2, "金": 0.8, "土": 0.5, "火": 0.3},
    "子": {"水": 1.5, "木": 1.2, "金": 0.8, "土": 0.5, "火": 0.3},
    "丑": {"水": 1.2, "木": 1.0, "金": 0.8, "土": 1.5, "火": 0.5},  # 丑月土旺
}

# 地支藏干本气权重（每柱地支可能含1~3个藏干，主气最重，中气次，余气最弱）
# 参考《子平真诠》本气主气60%、中气30%、余气10%的取用原则
HIDDEN_WEIGHT = [0.6, 0.3, 0.1]  # 主气/中气/余气
HIDDEN = {
    "子": ["癸"], "丑": ["己", "癸", "辛"], "寅": ["甲", "丙", "戊"], "卯": ["乙"],
    "辰": ["戊", "乙", "癸"], "巳": ["丙", "庚", "戊"], "午": ["丁", "己"],
    "未": ["己", "丁", "乙"], "申": ["庚", "壬", "戊"], "酉": ["辛"],
    "戌": ["戊", "辛", "丁"], "亥": ["壬", "甲"],
}
SHENG = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
KE = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}

NAYIN = {    "甲子": "海中金", "乙丑": "海中金", "丙寅": "炉中火", "丁卯": "炉中火",
    "戊辰": "大林木", "己巳": "大林木", "庚午": "路旁土", "辛未": "路旁土",
    "壬申": "剑锋金", "癸酉": "剑锋金", "甲戌": "山头火", "乙亥": "山头火",
    "丙子": "涧下水", "丁丑": "涧下水", "戊寅": "城头土", "己卯": "城头土",
    "庚辰": "白蜡金", "辛巳": "白蜡金", "壬午": "杨柳木", "癸未": "杨柳木",
    "甲申": "泉中水", "乙酉": "泉中水", "丙戌": "屋上土", "丁亥": "屋上土",
    "戊子": "霹雷火", "己丑": "霹雷火", "庚寅": "松柏木", "辛卯": "松柏木",
    "壬辰": "长流水", "癸巳": "长流水", "甲午": "沙中金", "乙未": "沙中金",
    "丙申": "山下火", "丁酉": "山下火", "戊戌": "平地木", "己亥": "平地木",
    "庚子": "壁上土", "辛丑": "壁上土", "壬寅": "金箔金", "癸卯": "金箔金",
    "甲辰": "覆灯火", "乙巳": "覆灯火", "丙午": "天河水", "丁未": "天河水",
    "戊申": "大驿土", "己酉": "大驿土", "庚戌": "钗钏金", "辛亥": "钗钏金",
    "壬子": "桑柘木", "癸丑": "桑柘木", "甲寅": "大溪水", "乙卯": "大溪水",
    "丙辰": "沙中土", "丁巳": "沙中土", "戊午": "天上火", "己未": "天上火",
    "庚申": "石榴木", "辛酉": "石榴木", "壬戌": "大海水", "癸亥": "大海水",
}


# ===== 地支关系（合/冲/刑/害/破）：合婚、论人际、夫妻宫判断的核心 =====
# 六合：子丑合土、寅亥合木、卯戌合火、辰酉合金、巳申合水、午未合土
LIU_HE = {
    "子": "丑", "丑": "子", "寅": "亥", "亥": "寅", "卯": "戌", "戌": "卯",
    "辰": "酉", "酉": "辰", "巳": "申", "申": "巳", "午": "未", "未": "午",
}
LIU_HE_HUA = {  # 六合化出的五行
    ("子", "丑"): "土", ("寅", "亥"): "木", ("卯", "戌"): "火",
    ("辰", "酉"): "金", ("巳", "申"): "水", ("午", "未"): "土",
}
# 三合局：申子辰合水、亥卯未合木、寅午戌合火、巳酉丑合金
SAN_HE = {
    "申": ("水", "子", "辰"), "子": ("水", "申", "辰"), "辰": ("水", "申", "子"),
    "亥": ("木", "卯", "未"), "卯": ("木", "亥", "未"), "未": ("木", "亥", "卯"),
    "寅": ("火", "午", "戌"), "午": ("火", "寅", "戌"), "戌": ("火", "寅", "午"),
    "巳": ("金", "酉", "丑"), "酉": ("金", "巳", "丑"), "丑": ("金", "巳", "酉"),
}
# 六冲：子午冲、丑未冲、寅申冲、卯酉冲、辰戌冲、巳亥冲
LIU_CHONG = {
    "子": "午", "午": "子", "丑": "未", "未": "丑", "寅": "申", "申": "寅",
    "卯": "酉", "酉": "卯", "辰": "戌", "戌": "辰", "巳": "亥", "亥": "巳",
}
# 相刑：无恩之刑（寅巳申）、恃势之刑（丑戌未）、无礼之刑（子卯）、自刑（辰午酉亥）
XIANG_XING = {
    "寅": ["巳", "申"], "巳": ["寅", "申"], "申": ["寅", "巳"],  # 寅巳申三刑
    "丑": ["戌", "未"], "戌": ["丑", "未"], "未": ["丑", "戌"],  # 丑戌未三刑
    "子": ["卯"], "卯": ["子"],                                 # 子卯刑
    "辰": ["辰"], "午": ["午"], "酉": ["酉"], "亥": ["亥"],      # 自刑
}
# 相害：子未害、丑午害、寅巳害、卯辰害、申亥害、酉戌害
XIANG_HAI = {
    "子": "未", "未": "子", "丑": "午", "午": "丑", "寅": "巳", "巳": "寅",
    "卯": "辰", "辰": "卯", "申": "亥", "亥": "申", "酉": "戌", "戌": "酉",
}
# 相破：子酉破、卯午破、辰丑破、戌未破、寅亥破、巳申破
XIANG_PO = {
    "子": "酉", "酉": "子", "卯": "午", "午": "卯", "辰": "丑", "丑": "辰",
    "戌": "未", "未": "戌", "寅": "亥", "亥": "寅", "巳": "申", "申": "巳",
}


def _zhi_relation_str(zhi_list: list) -> str:
    """给出一组地支（四柱地支或双方地支）之间的关系描述，用于合盘/合婚。"""
    out = []
    seen_pairs = set()
    for i in range(len(zhi_list)):
        for j in range(i + 1, len(zhi_list)):
            a, b = zhi_list[i], zhi_list[j]
            key = tuple(sorted([a, b]))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            rel = []
            if LIU_HE.get(a) == b:
                hua = LIU_HE_HUA.get(tuple(sorted([a, b])), "")
                rel.append(f"{a}{b}六合{'化' + hua if hua else ''}")
            if LIU_CHONG.get(a) == b:
                rel.append(f"{a}{b}相冲")
            if b in XIANG_XING.get(a, []):
                rel.append(f"{a}{b}相刑")
            if XIANG_HAI.get(a) == b:
                rel.append(f"{a}{b}相害")
            if XIANG_PO.get(a) == b:
                rel.append(f"{a}{b}相破")
            if rel:
                out.append("、".join(rel))
    return "；".join(out) if out else "（四支之间无冲合刑害）"


def relation_between(chart_a: dict, chart_b: dict) -> dict:
    """预计算两份八字盘之间的关键关系，返回确定性结论，供合婚/论关系直接引用。
    目的：把生克方向、干支对应、冲合关系这些"模型容易算错"的东西算死，
    避免模型把"土生金"说成"金生土"、或把对方日支搞错。"""
    da = chart_a["day_master"]              # 我方日干
    db = chart_b["day_master"]              # 对方日干
    ea = ELEM_STEM[STEMS.index(da)]         # 我方日主五行
    eb = ELEM_STEM[STEMS.index(db)]         # 对方日主五行
    # 日干生克关系（我方日主 对 对方日主）
    if ea == eb:
        gan_rel = f"{da}{ea} 与 {db}{eb} 同属{ea}，比和（同类相助，志趣相近）"
    elif SHENG.get(ea) == eb:
        gan_rel = f"{da}{ea} 生 {db}{eb}（我方{ea}生对方{eb}，我方主动付出、滋养对方）"
    elif SHENG.get(eb) == ea:
        gan_rel = f"{db}{eb} 生 {da}{ea}（对方{eb}生我方{ea}，对方主动付出、滋养我方）"
    elif KE.get(ea) == eb:
        gan_rel = f"{da}{ea} 克 {db}{eb}（我方{ea}克对方{eb}，我方占主导、易给对方压力）"
    elif KE.get(eb) == ea:
        gan_rel = f"{db}{eb} 克 {da}{ea}（对方{eb}克我方{ea}，对方占主导、我方易感压力）"
    else:
        gan_rel = f"{da}{ea} 与 {db}{eb}（无直接生克）"

    # 天干五合（鸳鸯合）：甲己合土、乙庚合金、丙辛合水、丁壬合木、戊癸合火
    WU_HE = {
        frozenset(["甲", "己"]): "土", frozenset(["乙", "庚"]): "金",
        frozenset(["丙", "辛"]): "水", frozenset(["丁", "壬"]): "木",
        frozenset(["戊", "癸"]): "火",
    }
    hua = WU_HE.get(frozenset([da, db]))
    if hua:
        gan_rel += f"；且 {da}{db} 天干五合化{hua}（鸳鸯合，主情投意合、缘分深）"

    # 夫妻宫（日支）关系
    zhi_a = chart_a["pillars"]["day"]["ganzhi"][1]
    zhi_b = chart_b["pillars"]["day"]["ganzhi"][1]
    couple_parts = []
    if LIU_HE.get(zhi_a) == zhi_b:
        couple_parts.append(f"日支 {zhi_a}×{zhi_b} 六合（夫妻宫相合，感情融洽）")
    if LIU_CHONG.get(zhi_a) == zhi_b:
        couple_parts.append(f"日支 {zhi_a}×{zhi_b} 相冲（夫妻宫相冲，易有摩擦）")
    if zhi_b in XIANG_XING.get(zhi_a, []):
        couple_parts.append(f"日支 {zhi_a}×{zhi_b} 相刑（夫妻宫带刑，需包容）")
    if XIANG_HAI.get(zhi_a) == zhi_b:
        couple_parts.append(f"日支 {zhi_a}×{zhi_b} 相害（夫妻宫带害，暗生嫌隙）")
    if not couple_parts:
        couple_parts.append(f"日支 {zhi_a}×{zhi_b} 无冲合刑害（夫妻宫平稳）")
    couple_rel = "；".join(couple_parts)

    # 双方地支（四柱全部地支两两）冲合
    zhi_all_a = [chart_a["pillars"][k]["ganzhi"][1] for k in ("year", "month", "day", "time")]
    zhi_all_b = [chart_b["pillars"][k]["ganzhi"][1] for k in ("year", "month", "day", "time")]
    cross_rel = _zhi_relation_str(zhi_all_a + zhi_all_b)

    # 五行互补：我方缺的对方旺、我方旺的对方缺
    miss_a = set(chart_a.get("wuxing_missing", []))
    miss_b = set(chart_b.get("wuxing_missing", []))
    strong_a = chart_a.get("wuxing_strongest", "")
    strong_b = chart_b.get("wuxing_strongest", "")
    complement = []
    if strong_b in miss_a:
        complement.append(f"我方缺{strong_b}，对方{strong_b}旺，可互补")
    if strong_a in miss_b:
        complement.append(f"对方缺{strong_a}，我方{strong_a}旺，可互补")
    if not complement:
        complement.append("双方五行喜忌未形成明显互补，需看具体用神")

    return {
        "gan_rel": gan_rel,
        "couple_rel": couple_rel,
        "cross_zhi_rel": cross_rel,
        "complement": "；".join(complement),
        "day_gan_a": da, "day_gan_b": db,
        "day_zhi_a": zhi_a, "day_zhi_b": zhi_b,
    }


# ===== 神煞查表（命理神煞，非黄历值日神）=====
# 以年支或日支起（三合局推），命理传统用年支+日支双查
# 驿马：三合局长生位对冲之支。申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳
YI_MA = {
    "申": "寅", "子": "寅", "辰": "寅",   # 申子辰马在寅
    "寅": "申", "午": "申", "戌": "申",   # 寅午戌马在申
    "巳": "亥", "酉": "亥", "丑": "亥",   # 巳酉丑马在亥
    "亥": "巳", "卯": "巳", "未": "巳",   # 亥卯未马在巳
}
# 桃花（咸池）：三合局沐浴位。申子辰桃花在酉、寅午戌在卯、巳酉丑在午、亥卯未在子
TAO_HUA = {
    "申": "酉", "子": "酉", "辰": "酉",
    "寅": "卯", "午": "卯", "戌": "卯",
    "巳": "午", "酉": "午", "丑": "午",
    "亥": "子", "卯": "子", "未": "子",
}
# 华盖：三合局墓库位。申子辰华盖在辰、寅午戌在戌、巳酉丑在丑、亥卯未在未
HUA_GAI = {
    "申": "辰", "子": "辰", "辰": "辰",
    "寅": "戌", "午": "戌", "戌": "戌",
    "巳": "丑", "酉": "丑", "丑": "丑",
    "亥": "未", "卯": "未", "未": "未",
}
# 将星：三合局帝旺位。申子辰将在子、寅午戌在午、巳酉丑在酉、亥卯未在卯
JIANG_XING = {
    "申": "子", "子": "子", "辰": "子",
    "寅": "午", "午": "午", "戌": "午",
    "巳": "酉", "酉": "酉", "丑": "酉",
    "亥": "卯", "卯": "卯", "未": "卯",
}
# 亡神：三合局官鬼（临官）位。申子辰亡神在亥、寅午戌在巳、巳酉丑在申、亥卯未在寅
WANG_SHEN = {
    "申": "亥", "子": "亥", "辰": "亥",
    "寅": "巳", "午": "巳", "戌": "巳",
    "巳": "申", "酉": "申", "丑": "申",
    "亥": "寅", "卯": "寅", "未": "寅",
}
# 劫煞：三合局绝地。申子辰劫煞在巳、寅午戌在亥、巳酉丑在寅、亥卯未在申
JIE_SHA = {
    "申": "巳", "子": "巳", "辰": "巳",
    "寅": "亥", "午": "亥", "戌": "亥",
    "巳": "寅", "酉": "寅", "丑": "寅",
    "亥": "申", "卯": "申", "未": "申",
}
# 天德贵人（以月支查，简化月支→天干）：寅月丁、卯月申、辰月壬、巳月辛、午月亥、未月甲、
# 申月癸、酉月寅、戌月丙、亥月乙、子月巳、丑月庚
TIAN_DE = {
    "寅": "丁", "卯": "申", "辰": "壬", "巳": "辛", "午": "亥", "未": "甲",
    "申": "癸", "酉": "寅", "戌": "丙", "亥": "乙", "子": "巳", "丑": "庚",
}
# 月德贵人（以月支查）：寅午戌月德在丙、申子辰月德在壬、亥卯未月德在甲、巳酉丑月德在庚
YUE_DE = {
    "寅": "丙", "午": "丙", "戌": "丙",
    "申": "壬", "子": "壬", "辰": "壬",
    "亥": "甲", "卯": "甲", "未": "甲",
    "巳": "庚", "酉": "庚", "丑": "庚",
}
# 文昌（以日干查）：甲巳、乙午、丙申、丁酉、戊申、己酉、庚亥、辛子、壬寅、癸卯
WEN_CHANG = {
    "甲": "巳", "乙": "午", "丙": "申", "丁": "酉", "戊": "申",
    "己": "酉", "庚": "亥", "辛": "子", "壬": "寅", "癸": "卯",
}
# 孤辰寡宿（以年支查）：亥子丑人见寅为孤辰、见戌为寡宿；寅卯辰见巳/丑；巳午未见申/辰；申酉戌见亥/未
GU_CHEN = {
    "亥": "寅", "子": "寅", "丑": "寅",   # 亥子丑 → 孤辰寅
    "寅": "巳", "卯": "巳", "辰": "巳",   # 寅卯辰 → 孤辰巳
    "巳": "申", "午": "申", "未": "申",   # 巳午未 → 孤辰申
    "申": "亥", "酉": "亥", "戌": "亥",   # 申酉戌 → 孤辰亥
}
GUA_SU = {
    "亥": "戌", "子": "戌", "丑": "戌",   # 亥子丑 → 寡宿戌
    "寅": "丑", "卯": "丑", "辰": "丑",   # 寅卯辰 → 寡宿丑
    "巳": "辰", "午": "辰", "未": "辰",   # 巳午未 → 寡宿辰
    "申": "未", "酉": "未", "戌": "未",   # 申酉戌 → 寡宿未
}
# 羊刃（以日干查，阳干才有）：甲刃卯、丙刃午、戊刃午、庚刃酉、壬刃子
YANG_REN = {"甲": "卯", "丙": "午", "戊": "午", "庚": "酉", "壬": "子"}
# 禄神（以日干查）：甲禄寅、乙禄卯、丙禄巳、丁禄午、戊禄巳、己禄午、庚禄申、辛禄酉、壬禄亥、癸禄子
LU_SHEN = {
    "甲": "寅", "乙": "卯", "丙": "巳", "丁": "午", "戊": "巳",
    "己": "午", "庚": "申", "辛": "酉", "壬": "亥", "癸": "子",
}


def _shen_sha(pillars: dict) -> dict:
    """计算命局神煞（以年支、日支、日干、月支起）。返回 {神煞名: [所在柱]}。"""
    year_zhi = pillars["year"]["ganzhi"][1]
    day_zhi = pillars["day"]["ganzhi"][1]
    day_gan = pillars["day"]["ganzhi"][0]
    month_zhi = pillars["month"]["ganzhi"][1]
    zhi_by_pos = {  # 便于按"神煞落在哪个柱"定位
        "year": year_zhi, "month": month_zhi,
        "day": day_zhi, "time": pillars["time"]["ganzhi"][1],
    }
    # 每个地支在哪几柱出现（地支可能重复）
    pos_of_zhi = {}
    for pos, z in zhi_by_pos.items():
        pos_of_zhi.setdefault(z, []).append(pos)

    result = {}
    def add(name, zhi_target, source_label):
        if zhi_target is None:
            return
        for pos in pos_of_zhi.get(zhi_target, []):
            result.setdefault(name, []).append(pos)

    # 以年支查
    add("驿马", YI_MA.get(year_zhi), "年支")
    add("桃花", TAO_HUA.get(year_zhi), "年支")
    add("华盖", HUA_GAI.get(year_zhi), "年支")
    add("将星", JIANG_XING.get(year_zhi), "年支")
    add("亡神", WANG_SHEN.get(year_zhi), "年支")
    add("劫煞", JIE_SHA.get(year_zhi), "年支")
    add("孤辰", GU_CHEN.get(year_zhi), "年支")
    add("寡宿", GUA_SU.get(year_zhi), "年支")
    # 以日支查
    add("驿马", YI_MA.get(day_zhi), "日支")
    add("桃花", TAO_HUA.get(day_zhi), "日支")
    add("华盖", HUA_GAI.get(day_zhi), "日支")
    add("将星", JIANG_XING.get(day_zhi), "日支")
    add("亡神", WANG_SHEN.get(day_zhi), "日支")
    add("劫煞", JIE_SHA.get(day_zhi), "日支")
    # 以日干查
    add("文昌", WEN_CHANG.get(day_gan), "日干")
    add("羊刃", YANG_REN.get(day_gan), "日干")
    add("禄神", LU_SHEN.get(day_gan), "日干")
    # 以月支查（贵人）
    tian = TIAN_DE.get(month_zhi)
    yue = YUE_DE.get(month_zhi)
    # 天德/月德是"天干"贵，需查四柱天干是否命中
    gan_by_pos = {k: v["ganzhi"][0] for k, v in pillars.items()}
    for pos, g in gan_by_pos.items():
        if g == tian:
            result.setdefault("天德贵人", []).append(pos)
        if g == yue:
            result.setdefault("月德贵人", []).append(pos)

    # 去重 + 排序柱位（year/month/day/time 顺序）
    order = {"year": 0, "month": 1, "day": 2, "time": 3}
    for name in result:
        result[name] = sorted(set(result[name]), key=lambda p: order[p])
    return result


def _liunian_yingshi(liunian_ganzhi: str, pillars: dict, day_gan: str) -> str:
    """计算某流年干支与命局的应期提示（冲合、驿马、桃花、十神）。
    目的：把"哪年该注意什么"的应期判断从「模型瞎编」变成「确定性计算」，
    让流年解读落到具体的地支冲合与神煞触发上，而不是笼统的"这年运势不错"。"""
    gz = liunian_ganzhi
    if len(gz) != 2:
        return ""
    gan, zhi = gz[0], gz[1]
    zhis = [pillars[k]["ganzhi"][1] for k in ("year", "month", "day", "time")]
    tips = []
    # 流年地支与四柱地支的冲合刑害
    for i, b in enumerate(zhis):
        pos = ("年柱", "月柱", "日柱", "时柱")[i]
        if LIU_CHONG.get(zhi) == b:
            tips.append(f"流年{zhi}冲{pos}{b}（变动、冲撞，该宫位易有波折）")
        elif LIU_HE.get(zhi) == b:
            hua = LIU_HE_HUA.get(tuple(sorted([zhi, b])), "")
            tips.append(f"流年{zhi}与{pos}{b}六合{'化' + hua if hua else ''}（合好、顺遂，利于该宫位事务）")
        elif b in XIANG_XING.get(zhi, []):
            tips.append(f"流年{zhi}与{pos}{b}相刑（易有摩擦、口舌、隐忧）")
        elif XIANG_HAI.get(zhi) == b:
            tips.append(f"流年{zhi}与{pos}{b}相害（易有小人、损耗、暗伤）")
    # 流年是否触发命局驿马 / 桃花（以年支、日支查）
    year_zhi = pillars["year"]["ganzhi"][1]
    day_zhi = pillars["day"]["ganzhi"][1]
    if YI_MA.get(year_zhi) == zhi or YI_MA.get(day_zhi) == zhi:
        tips.append(f"流年{zhi}逢驿马（主走动、搬迁、出行、变动）")
    if TAO_HUA.get(year_zhi) == zhi or TAO_HUA.get(day_zhi) == zhi:
        tips.append(f"流年{zhi}逢桃花（主姻缘、人缘、情缘，易有感情际遇）")
    # 流年天干十神（对日主的十神，判断这一年主事的十神）
    if gan and day_gan:
        ss = shi_shen(day_gan, gan)
        tips.append(f"流年天干{gan}为{ss}（{ss}主事）")
    return "；".join(tips) if tips else "（与命局四柱无直接冲合，流年天干" + gan + "主事）"


def shi_shen(day_gan: str, other_gan: str) -> str:
    """十神：日主天干相对其他天干的关系。"""
    de, oe = ELEM_STEM[STEMS.index(day_gan)], ELEM_STEM[STEMS.index(other_gan)]
    same = STEMS.index(day_gan) % 2 == STEMS.index(other_gan) % 2
    if de == oe:
        return "比肩" if same else "劫财"
    if SHENG[de] == oe:
        return "食神" if same else "伤官"
    if SHENG[oe] == de:
        return "正印" if not same else "偏印"
    if KE[de] == oe:
        return "正财" if not same else "偏财"
    return "正官" if not same else "七杀"


def _pillar(ec, day_gan: str, part: str) -> dict:
    gz = getattr(ec, f"get{part}")()
    gan, zhi = gz[0], gz[1]
    return {
        "ganzhi": gz,
        "nayin": NAYIN.get(gz, ""),
        "gan_element": ELEM_STEM[STEMS.index(gan)],
        "zhi_element": ELEM_BRANCH[zhi],
        "hidden_gan": HIDDEN[zhi],
        "shi_shen_gan": "" if part == "Day" else shi_shen(day_gan, gan),
        "shi_shen_zhi": [shi_shen(day_gan, h) for h in HIDDEN[zhi]],
    }


def calc_bazi(year: int, month: int, day: int, hour: int, minute: int,
              gender: str = "男", time_precise: bool = True, place: str = "") -> dict:
    solar = Solar.fromYmdHms(year, month, day, hour, minute, 0)
    lunar = solar.getLunar()
    ec = lunar.getEightChar()
    day_gan = ec.getDay()[0]

    pillars = {
        "year": _pillar(ec, day_gan, "Year"),
        "month": _pillar(ec, day_gan, "Month"),
        "day": _pillar(ec, day_gan, "Day"),
        "time": _pillar(ec, day_gan, "Time"),
    }

    all_gz = [pillars[k]["ganzhi"] for k in ("year", "month", "day", "time")]
    # 简单计数（保留作为基础参考）
    wuxing = {"金": 0, "木": 0, "水": 0, "火": 0, "土": 0}
    for gz in all_gz:
        wuxing[ELEM_STEM[STEMS.index(gz[0])]] += 1
        wuxing[ELEM_BRANCH[gz[1]]] += 1
    missing = [e for e, c in wuxing.items() if c == 0]
    strongest = max(wuxing, key=wuxing.get)

    # ===== 地支关系（四柱地支之间的冲合刑害破）=====
    zhi_list = [pillars[k]["ganzhi"][1] for k in ("year", "month", "day", "time")]
    zhi_relations = _zhi_relation_str(zhi_list)

    # ===== 神煞 =====
    shen_sha = _shen_sha(pillars)

    # ===== 四柱空亡（用 lunar_python 现成）=====
    xun_kong = {
        "year": ec.getYearXunKong(),
        "month": ec.getMonthXunKong(),
        "day": ec.getDayXunKong(),
        "time": ec.getTimeXunKong(),
    }

    # ===== 十二长生地势（日主及各柱天干坐支的旺衰状态）=====
    di_shi = {
        "year": ec.getYearDiShi(),
        "month": ec.getMonthDiShi(),
        "day": ec.getDayDiShi(),
        "time": ec.getTimeDiShi(),
    }

    # ===== 命宫 / 身宫 / 胎元 / 胎息（用 lunar_python 现成）=====
    ming_shen = {
        "命宫": ec.getMingGong() or "",
        "身宫": ec.getShenGong() or "",
        "胎元": ec.getTaiYuan() or "",
        "胎息": ec.getTaiXi() or "",
    }

    # ===== 命理精度：考虑月令旺衰 + 藏干权重的真实五行力量 =====
    # 月令（月支）= 提纲，决定五行真实力量。生于冬水旺火弱、生于夏火旺水弱，
    # 简单计数会把"冬月丁火2个木"误判为平衡，实际冬丁火极弱需调候。
    month_zhi = pillars["month"]["ganzhi"][1]
    season_weight = SEASON_STRENGTH.get(month_zhi, {e: 1.0 for e in wuxing})

    wuxing_strength = {"金": 0.0, "木": 0.0, "水": 0.0, "火": 0.0, "土": 0.0}
    for pillar in pillars.values():
        gan = pillar["ganzhi"][0]
        zhi = pillar["ganzhi"][1]
        # 天干：乘以月令权重
        elem = ELEM_STEM[STEMS.index(gan)]
        wuxing_strength[elem] += season_weight[elem]
        # 地支本气：乘以月令权重和藏干权重
        hidden = HIDDEN[zhi]
        for i, h in enumerate(hidden):
            if i >= len(HIDDEN_WEIGHT):
                break
            h_elem = ELEM_STEM[STEMS.index(h)]
            wuxing_strength[h_elem] += season_weight[h_elem] * HIDDEN_WEIGHT[i]
    # 归一化到0~10区间，便于模型直观比较
    max_s = max(wuxing_strength.values()) or 1.0
    wuxing_normalized = {e: round(v / max_s * 10, 2) for e, v in wuxing_strength.items()}

    # 日主强弱判定（决定喜用神方向）
    day_elem = ELEM_STEM[STEMS.index(day_gan)]
    day_score = wuxing_strength[day_elem]
    others = [v for k, v in wuxing_strength.items() if k != day_elem]
    others_avg = sum(others) / len(others) if others else 0
    if day_score >= others_avg * 1.3 and day_score > 6:
        day_strength = "身旺"
    elif day_score <= others_avg * 0.7 and day_score < 4:
        day_strength = "身弱"
    else:
        day_strength = "中和"
    # 喜用神：身旺取克泄（官杀食伤财），身弱取生扶（印比）
    XIYONG = {
        "身旺": ["官杀", "食伤", "财"],
        "身弱": ["印", "比劫"],
        "中和": ["调候用神", "扶抑平衡"],
    }
    favorable = XIYONG[day_strength]
    # 调候用神（出生季节对应的关键调候五行，冬夏特别需要）
    DIAOHOU = {
        "寅": "丙火", "卯": "丙火", "辰": "壬水", "巳": "壬水", "午": "壬水",
        "未": "癸水", "申": "丁火", "酉": "丁火", "戌": "甲木", "亥": "戊土",
        "子": "戊土", "丑": "丙火",
    }
    diaohou = DIAOHOU.get(month_zhi, "")

    dayun = []
    try:
        yun = ec.getYun(1 if gender == "男" else 0)
        for i, dy in enumerate(yun.getDaYun()):
            gz = dy.getGanZhi()
            if not gz:
                continue
            dayun.append({
                "ganzhi": gz,
                "start_age": dy.getStartAge(),
                "end_age": dy.getEndAge(),
                "start_year": dy.getStartYear(),
                "end_year": dy.getEndYear(),
            })
    except Exception:
        pass

    current_dayun = ""
    import datetime
    now_y = datetime.date.today().year
    current_dayun_info = None
    for d in dayun:
        if d["start_year"] <= now_y <= d["end_year"]:
            current_dayun = d["ganzhi"]
            current_dayun_info = d
            break

    # 未来十二年流年干支 + 应期提示（与命局四柱的冲合、驿马桃花、流年十神）
    liunian = []
    for y in range(now_y, now_y + 12):
        ly = Solar.fromYmd(y, 6, 1).getLunar()
        gz = ly.getYearInGanZhi()
        liunian.append({
            "year": y,
            "ganzhi": gz,
            "yingshi": _liunian_yingshi(gz, pillars, day_gan),
        })

    return {
        "solar": f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}",
        "lunar": f"农历{lunar.getYearInChinese()}年{lunar.getMonthInChinese()}月{lunar.getDayInChinese()}",
        "zodiac": lunar.getYearShengXiao(),
        "animal_year_gz": lunar.getYearInGanZhi(),
        "gender": gender,
        "place": place,
        "time_precise": bool(time_precise),
        "pillars": pillars,
        "day_master": day_gan,
        "day_master_element": ELEM_STEM[STEMS.index(day_gan)],
        "wuxing_count": wuxing,
        "wuxing_missing": missing,
        "wuxing_strongest": strongest,
        "wuxing_strength": wuxing_strength,            # 加权后真实力量
        "wuxing_normalized": wuxing_normalized,        # 0-10 归一化
        "season_weight": season_weight,                # 当前月令的五行旺衰
        "month_zhi": month_zhi,                        # 月支（季节）
        "day_strength": day_strength,                  # 身旺/身弱/中和
        "favorable": favorable,                        # 喜用神方向
        "diaohou": diaohou,                            # 调候用神
        "dayun": dayun,
        "current_dayun": current_dayun,
        "current_dayun_info": current_dayun_info,
        "liunian": liunian,
        "now_year": now_y,
        "zhi_relations": zhi_relations,                # 四柱地支冲合刑害破
        "shen_sha": shen_sha,                          # 神煞（驿马/桃花/天德/华盖等）
        "xun_kong": xun_kong,                          # 四柱空亡
        "di_shi": di_shi,                              # 十二长生地势
        "ming_shen": ming_shen,                        # 命宫/身宫/胎元/胎息
    }


if __name__ == "__main__":
    import json
    print(json.dumps(calc_bazi(2007, 6, 24, 19, 0, "男"), ensure_ascii=False, indent=2))
