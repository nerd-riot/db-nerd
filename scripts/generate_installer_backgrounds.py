#!/usr/bin/env python3
"""
Generate high-fidelity, Retina (@2x) macOS DMG installer backgrounds matching Airtame style.
"""

import os
import sys
import json
import math
from PIL import Image, ImageDraw, ImageFont

def draw_rounded_cap_line(draw, p1, p2, fill, width):
    draw.line([p1, p2], fill=fill, width=width)
    r = width / 2
    draw.ellipse([p1[0] - r, p1[1] - r, p1[0] + r, p1[1] + r], fill=fill)
    draw.ellipse([p2[0] - r, p2[1] - r, p2[0] + r, p2[1] + r], fill=fill)

def draw_airtame_arrow(draw, center_x, center_y, scale=2, length=64, stroke_width=5.5, color=(11, 26, 48, 255)):
    """Clean, bold directional arrow like Airtame with rounded joints and ends."""
    w = int(stroke_width * scale)
    half_len = int((length * scale) / 2)
    start_x = center_x - half_len
    end_x = center_x + half_len
    
    # Stem
    draw_rounded_cap_line(draw, (start_x, center_y), (end_x, center_y), fill=color, width=w)
    
    # Chevrons (angled back ~38 degrees, length ~16pt)
    head_len = int(16 * scale)
    wing_dx = int(head_len * math.cos(math.radians(38)))
    wing_dy = int(head_len * math.sin(math.radians(38)))
    
    # Upper wing
    draw_rounded_cap_line(draw, (end_x, center_y), (end_x - wing_dx, center_y - wing_dy), fill=color, width=w)
    # Lower wing
    draw_rounded_cap_line(draw, (end_x, center_y), (end_x - wing_dx, center_y + wing_dy), fill=color, width=w)

def get_product_name():
    tauri_conf = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "tauri.conf.json")
    try:
        with open(tauri_conf, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("productName", "DBNerd")
    except Exception:
        return "DBNerd"

def generate_background(out_1x, out_2x, app_name=None):
    if not app_name:
        app_name = get_product_name()

    scale = 2
    # 660 x 440 window
    w, h = 660 * scale, 440 * scale
    
    # Clean white background
    img = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Coordinates in 2x:
    app_cx = int(180 * scale)
    apps_cx = int(480 * scale)
    center_x = (app_cx + apps_cx) // 2
    
    # Center arrow vertically matches the visual center of 120x120 icons (y=210)
    arrow_y = int(210 * scale)
    
    # Draw Airtame-style arrow in center
    draw_airtame_arrow(
        draw,
        center_x=center_x,
        center_y=arrow_y,
        scale=scale,
        length=64,
        stroke_width=5.5,
        color=(11, 26, 48, 255) # Deep navy #0b1a30
    )
    
    # Typography: Deep navy #0b1a30, bold modern font
    font_path = "/System/Library/Fonts/SFCompact.ttf"
    if not os.path.exists(font_path):
        font_path = "/System/Library/Fonts/SFNS.ttf"
        
    try:
        font_title = ImageFont.truetype(font_path, int(28 * scale))
    except Exception:
        font_title = ImageFont.load_default()
        
    line1 = f"Drag {app_name} into your"
    line2 = "Applications folder"
    
    bbox1 = draw.textbbox((0, 0), line1, font=font_title)
    w1 = bbox1[2] - bbox1[0]
    draw.text(((w - w1) // 2, int(46 * scale)), line1, fill=(11, 26, 48, 255), font=font_title)
    
    bbox2 = draw.textbbox((0, 0), line2, font=font_title)
    w2 = bbox2[2] - bbox2[0]
    draw.text(((w - w2) // 2, int(86 * scale)), line2, fill=(11, 26, 48, 255), font=font_title)
    
    # Save 1x and 2x
    img_1x = img.resize((660, 440), Image.Resampling.LANCZOS)
    img_1x.save(out_1x)
    img.save(out_2x)
    print(f"Generated Airtame DMG background for '{app_name}': {out_1x} and {out_2x}")

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else None
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    out_1x = os.path.join(icons_dir, "dmg-background.png")
    out_2x = os.path.join(icons_dir, "dmg-background@2x.png")
    generate_background(out_1x, out_2x, app_name=name)
