import random
import turtle

# --- Setup & Palette ---
screen = turtle.Screen()
screen.setup(800, 600)
screen.setworldcoordinates(-400, -300, 400, 300)
screen.title("Gemini 3.6 Flash")
turtle.tracer(0, 0)
t = turtle.Turtle()
t.hideturtle()
random.seed(2026)

BG, WATER, MOON, MOON_GLOW = "#0a0e1a", "#050812", "#ffeaa7", "#182035"
STARS = ["#ffffff", "#d4f0ff", "#ffeaa7", "#a29bfe"]
L1_COLOR = "#12172b"
L2_COLORS = ["#171f36", "#1c2642", "#151c31", "#222e4f"]
WINS = ["#ffd166", "#ffd166", "#4ecdc4", "#f4a261", "#1e2842", "#1e2842"]
BEACON = "#ff4757"
REFLECTS = ["#ffd166", "#4ecdc4", "#f4a261", "#1c2642"]


def draw_box(x, y, w, h, fill, border=None):
    t.penup(); t.goto(x, y); t.setheading(0)
    t.color(border or fill, fill); t.begin_fill()
    for d in (w, h, w, h): t.forward(d); t.left(90)
    t.end_fill()


def draw_sky_and_stars():
    draw_box(-400, -300, 800, 600, BG)
    for _ in range(85):
        t.penup(); t.goto(random.randint(-390, 390), random.randint(-50, 290))
        t.dot(random.choice([1, 1, 2, 2, 3]), random.choice(STARS))


def draw_moon(x, y):
    for r, col, cy in [(52, MOON_GLOW, y - 48), (40, MOON, y - 38), (35, BG, y - 32)]:
        t.penup(); t.goto(x + (14 if col == BG else 0), cy)
        t.color(col); t.begin_fill(); t.circle(r); t.end_fill()


def draw_searchlights(x, y):
    for angle, span, length in [(70, 16, 480), (110, 20, 520)]:
        for offset in range(-span // 2, span // 2 + 1, 2):
            t.penup(); t.goto(x, y); t.setheading(angle + offset)
            t.color("#ffffff" if abs(offset) <= 2 else "#4ecdc4")
            t.pendown(); t.forward(length)
    t.penup()


def draw_background_skyline():
    x = -400
    while x < 400:
        w, h = random.randint(45, 85), random.randint(110, 250)
        draw_box(x, -180, w, h, L1_COLOR); x += w - 6


def draw_foreground_skyline():
    buildings = [
        (-390, 180, 55, "flat"), (-340, 240, 60, "spire"), (-285, 200, 50, "stepped"),
        (-240, 310, 70, "antenna"), (-175, 220, 65, "flat"), (-115, 360, 75, "searchlight"),
        (-45, 190, 50, "flat"), (0, 280, 65, "stepped"), (60, 330, 70, "spire"),
        (125, 210, 55, "flat"), (175, 260, 60, "antenna"), (230, 190, 50, "stepped"),
        (275, 300, 65, "spire"), (335, 230, 60, "flat")
    ]
    for x, h, w, roof in buildings:
        col = random.choice(L2_COLORS)
        draw_box(x, -180, w, h, col)

        cols, rows = max(1, (w - 14) // 12), max(1, (h - 30) // 16)
        margin = (w - (cols * 12 - 6)) / 2
        for r in range(rows):
            for c in range(cols):
                draw_box(x + margin + c * 12, -165 + r * 16, 6, 8, random.choice(WINS))

        top_y, cx = -180 + h, x + w / 2
        if roof == "spire":
            t.penup(); t.goto(cx - 10, top_y); t.color(col); t.begin_fill()
            t.goto(cx, top_y + 45); t.goto(cx + 10, top_y); t.end_fill()
            t.goto(cx, top_y + 45); t.dot(5, BEACON)
        elif roof == "antenna":
            draw_box(cx - 15, top_y, 30, 12, col)
            t.penup(); t.goto(cx, top_y + 12); t.color("#a0a5b5"); t.pensize(2)
            t.pendown(); t.goto(cx, top_y + 50); t.pensize(1); t.dot(6, BEACON)
        elif roof == "stepped":
            draw_box(cx - w * 0.3, top_y, w * 0.6, 20, col)
            draw_box(cx - w * 0.15, top_y + 20, w * 0.3, 15, col)
        elif roof == "searchlight":
            t.penup(); t.goto(cx, top_y); t.color(col); t.pensize(3)
            t.pendown(); t.goto(cx, top_y + 35); t.pensize(1); t.dot(8, BEACON)
            draw_searchlights(cx, top_y + 35)


def draw_water_and_reflections():
    draw_box(-400, -300, 800, 120, WATER)
    for _ in range(70):
        t.penup(); t.goto(random.randint(-380, 380), random.randint(-290, -185))
        t.color(random.choice(REFLECTS)); t.pensize(random.randint(1, 2))
        t.pendown(); t.forward(random.randint(15, 55))
    t.pensize(1)


def main():
    draw_sky_and_stars()
    draw_moon(220, 175)
    draw_background_skyline()
    draw_foreground_skyline()
    draw_water_and_reflections()
    turtle.update()
    turtle.done()


if __name__ == "__main__":
    main()
