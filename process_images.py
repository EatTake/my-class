import os
from PIL import Image

def remove_white_bg(img_path, output_path, tolerance=20):
    """
    将图片的接近纯白的背景替换为透明
    """
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # 判断颜色接近纯白 (255, 255, 255)
        # item[0], item[1], item[2] 分别是 R, G, B
        if (item[0] >= 255 - tolerance and 
            item[1] >= 255 - tolerance and 
            item[2] >= 255 - tolerance):
            # 将满足条件的像素设为完全透明 (R, G, B, 0)
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Processed: {os.path.basename(img_path)}")

if __name__ == "__main__":
    src_dir = r"C:\Users\bdlb\.gemini\antigravity\brain\2f94d688-822f-4be6-8640-2eb0d1baf9cc"
    dest_dir = r"d:\MyClass\assets\characters"
    
    # 创建目标目录
    os.makedirs(dest_dir, exist_ok=True)
    
    # 查找所有AI生成的png图片
    for file_name in os.listdir(src_dir):
        if file_name.endswith(".png") and not file_name.startswith("start_screen") and not file_name.startswith("game_"):
            # 这个名字规则匹配了像 xm_sitting_123.png 的文件
            
            # 使用去除时间戳的名字保存为最终资源
            parts = file_name.split("_")
            if len(parts) >= 2:
                # 例如 xh_standing_1773142206670.png -> xh_standing.png
                base_name = f"{parts[0]}_{parts[1]}"
                if base_name in ["teacher_standing", "xm_sitting", "xm_raising", "xm_standing", 
                                "xh_sitting", "xh_raising", "xh_standing",
                                "xl_sitting", "xl_raising", "xl_standing",
                                "xg_sitting", "xg_raising", "xg_standing",
                                "xq_sitting", "xq_raising", "xq_standing"]:
                    
                    src_path = os.path.join(src_dir, file_name)
                    dest_path = os.path.join(dest_dir, f"{base_name}.png")
                    remove_white_bg(src_path, dest_path, tolerance=25)
    
    print("Done generating transparent character assets!")
