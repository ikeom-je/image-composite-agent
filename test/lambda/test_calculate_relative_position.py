"""calculate_relative_position ツールの unit test (issue #19 / Req 14)"""
import unittest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_tools import calculate_relative_position


class TestCalculateRelativePosition(unittest.TestCase):
    """LLM の暗算ミスを回避するため、相対配置算術がツール側で確定的に行われる
    ことを保証する代表値テスト。direction の別名・中央揃え・正負値対応含む。"""

    def setUp(self):
        # ref A: 中央付近 500x500 矩形（POSITION_MAP の「中央」近辺）
        self.ref = {"ref_x": 710, "ref_y": 290, "ref_width": 500, "ref_height": 500}

    def test_shita(self):
        """「Aの下に」 y = ref_y + ref_height + margin, x = ref_x"""
        r = calculate_relative_position(**self.ref, direction="下")
        self.assertEqual(r, {"x": 710, "y": 290 + 500 + 20})

    def test_shita_aliases(self):
        for d in ["下", "下部", "真下", "下に"]:
            r = calculate_relative_position(**self.ref, direction=d)
            self.assertEqual(r["y"], 810, f"alias {d!r} failed")

    def test_ue(self):
        """「Aの上に」 y = ref_y - target_height - margin"""
        r = calculate_relative_position(**self.ref, direction="上", target_height=60)
        self.assertEqual(r, {"x": 710, "y": 290 - 60 - 20})

    def test_migi(self):
        """「Aの右に」 x = ref_x + ref_width + margin"""
        r = calculate_relative_position(**self.ref, direction="右")
        self.assertEqual(r, {"x": 710 + 500 + 20, "y": 290})

    def test_hidari(self):
        """「Aの左に」 x = ref_x - target_width - margin"""
        r = calculate_relative_position(**self.ref, direction="左", target_width=144)
        self.assertEqual(r, {"x": 710 - 144 - 20, "y": 290})

    def test_yoko_narabi(self):
        """「Aと横に並べて」"""
        r = calculate_relative_position(**self.ref, direction="横並び")
        self.assertEqual(r, {"x": 1230, "y": 290})

    def test_tate_narabi(self):
        """「Aと縦に並べて」"""
        r = calculate_relative_position(**self.ref, direction="縦並び")
        self.assertEqual(r, {"x": 710, "y": 810})

    def test_chuou(self):
        """「Aの中央に」 B の中心が A の中心に重なる"""
        r = calculate_relative_position(**self.ref, direction="中央",
                                        target_width=200, target_height=100)
        # x = 710 + 250 - 100 = 860, y = 290 + 250 - 50 = 490
        self.assertEqual(r, {"x": 860, "y": 490})

    def test_mashita_chuou(self):
        """「真下中央」 A の下に B の中心を合わせる"""
        r = calculate_relative_position(**self.ref, direction="真下中央",
                                        target_width=200)
        # x = 710 + 250 - 100 = 860, y = 290 + 500 + 20 = 810
        self.assertEqual(r, {"x": 860, "y": 810})

    def test_maue_chuou(self):
        """「真上中央」"""
        r = calculate_relative_position(**self.ref, direction="真上中央",
                                        target_width=200, target_height=80)
        # x = 860, y = 290 - 80 - 20 = 190
        self.assertEqual(r, {"x": 860, "y": 190})

    def test_x_soroe(self):
        r = calculate_relative_position(**self.ref, direction="x揃え")
        self.assertEqual(r, {"x": 710, "y": 290})

    def test_y_soroe(self):
        r = calculate_relative_position(**self.ref, direction="y揃え")
        self.assertEqual(r, {"x": 710, "y": 290})

    def test_custom_margin(self):
        """margin パラメータが反映される"""
        r = calculate_relative_position(**self.ref, direction="下", margin=50)
        self.assertEqual(r["y"], 290 + 500 + 50)

    def test_margin_zero(self):
        """margin=0 で直接隣接"""
        r = calculate_relative_position(**self.ref, direction="下", margin=0)
        self.assertEqual(r["y"], 290 + 500)

    def test_unknown_direction(self):
        """未知の direction はエラーフィールド + ref 座標フォールバック"""
        r = calculate_relative_position(**self.ref, direction="斜め下")
        self.assertIn("error", r)
        self.assertEqual(r["x"], 710)
        self.assertEqual(r["y"], 290)

    def test_negative_y_for_ue(self):
        """「上」で B が大きすぎて画面外になる場合も生値を返す（clamp は compose_images 側）"""
        r = calculate_relative_position(**self.ref, direction="上", target_height=1000)
        # y = 290 - 1000 - 20 = -730
        self.assertEqual(r["y"], -730)


if __name__ == '__main__':
    unittest.main()
