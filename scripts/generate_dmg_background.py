from PIL import Image, ImageDraw, ImageFont

def generate_background():
    # 660 x 400 @ 2x = 1320 x 800
    scale = 2
    w, h = 660 * scale, 400 * scale

    # Dark background #0b0f19
    img = Image.new("RGBA", (w, h), (11, 15, 25, 255))
    draw = ImageDraw.Draw(img)

    # Subtle top border line
    draw.line([(0, 0), (w, 0)], fill=(255, 255, 255, 20), width=1)

    # Icons are positioned at:
    # App icon: x=180, y=170
    # Applications folder: x=480, y=170
    app_x, app_y = int(180 * scale), int(170 * scale)
    apps_x, apps_y = int(480 * scale), int(170 * scale)

    # Draw rounded drop zones (semi-transparent dark cards)
    card_w, card_h = int(140 * scale), int(140 * scale)
    for cx in [app_x, apps_x]:
        draw.rounded_rectangle(
            [cx - card_w // 2, app_y - card_h // 2 - int(10 * scale), cx + card_w // 2, app_y + card_h // 2 + int(10 * scale)],
            radius=int(24 * scale),
            fill=(18, 24, 38, 255),
            outline=(36, 200, 216, 40),
            width=2
        )

    # Arrow in the center between cards (from x=275 to 385)
    arrow_y = app_y - int(10 * scale)
    arrow_start = int(275 * scale)
    arrow_end = int(385 * scale)

    # Center capsule pill for the arrow
    pill_w = int(120 * scale)
    pill_h = int(48 * scale)
    pill_cx = (app_x + apps_x) // 2
    draw.rounded_rectangle(
        [pill_cx - pill_w // 2, arrow_y - pill_h // 2, pill_cx + pill_w // 2, arrow_y + pill_h // 2],
        radius=int(24 * scale),
        fill=(22, 30, 48, 255),
        outline=(36, 200, 216, 80),
        width=2
    )

    # Arrow shaft
    draw.line(
        [(arrow_start + int(15 * scale), arrow_y), (arrow_end - int(30 * scale), arrow_y)],
        fill=(36, 200, 216, 255),
        width=int(4 * scale)
    )

    # Arrow head
    head_size = int(12 * scale)
    ax = arrow_end - int(25 * scale)
    arrow_head = [
        (ax, arrow_y),
        (ax - head_size, arrow_y - head_size),
        (ax - int(head_size * 0.6), arrow_y),
        (ax - head_size, arrow_y + head_size),
    ]
    draw.polygon(arrow_head, fill=(36, 200, 216, 255))

    # Fonts
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", int(17 * scale))
        font_sub = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", int(13 * scale))
        font_label = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", int(12 * scale))
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_label = ImageFont.load_default()

    # Title text
    title_text = "To install DBNerd, drag the icon into Applications"
    bbox_title = draw.textbbox((0, 0), title_text, font=font_title)
    tw = bbox_title[2] - bbox_title[0]
    draw.text(((w - tw) // 2, int(45 * scale)), title_text, fill=(241, 245, 249, 255), font=font_title)

    # Subtitle / Hint text
    sub_text = "Once copied, launch DBNerd from Launchpad or Finder"
    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_sub)
    sw = bbox_sub[2] - bbox_sub[0]
    draw.text(((w - sw) // 2, int(325 * scale)), sub_text, fill=(100, 116, 139, 255), font=font_sub)

    # Save 1x and 2x
    img_1x = img.resize((660, 400), Image.Resampling.LANCZOS)
    img_1x.save("src-tauri/icons/dmg-background.png")
    img.save("src-tauri/icons/dmg-background@2x.png")
    print("Regenerated clean dmg-background.png and @2x.")

if __name__ == "__main__":
    generate_background()
