import random
import turtle

# --- Setup & Palette ---
screen = turtle.Screen()
screen.setup(800, 600)
screen.setworldcoordinates(-400, -300, 400, 300)
screen.title("Gemini 3.5 flash lite")
turtle.tracer(0, 0)
t = turtle.Turtle()
t.hideturtle()
random.seed(303)

BG, WATER, MOON = "#0d0b1e", "#08121a", "#e2f1f8"
STARS = ["#ffffff", "#ffecd1", "#a8edea", "#d8b4fe"]
L1_COLOR = "#1b1534"
L2_COLORS = ["#261e4c", "#322765", "#1f183d", "#3b2e6e"]
WINS = ["#ffd369", "#00b4d8", "#ff6b6b", "#1f183d", "#1f183d"]
AIRSHIP_BODY = "#2d3748"
AIRSHIP_GLOW = "#ffb703"


def draw_box(x, y, w, h, fill):
    t.penup(); t.goto(x, y); t.setheading(0)
    t.color(fill, fill); t.begin_fill()
    for d in (w, h, w, h): t.forward(d); t.left(90)
    t.end_fill()


def draw_sky_and_stars():
    draw_box(-400, -300, 800, 600, BG)
    for _ in range(90):
        t.penup(); t.goto(random.randint(-390, 390), random.randint(-40, 290))
        t.dot(random.choice([1, 1, 2, 2, 3]), random.choice(STARS))


def draw_moon(x, y):
    t.penup(); t.goto(x, y - 35); t.color("#1a1738"); t.begin_fill(); t.circle(42); t.end_fill()
    t.goto(x, y - 30); t.color(MOON); t.begin_fill(); t.circle(35); t.end_fill()


def draw_airship(x, y):
    # Accent element: Retro futuristic airship drifting across the sky
    t.penup(); t.goto(x, y); t.color(AIRSHIP_BODY)
    t.begin_fill(); t.circle(18, 180); t.setheading(0); t.forward(90); t.setheading(270); t.circle(18, 180); t.end_fill()
    # Gondola & lights
    draw_box(x + 30, y - 10, 20, 6, "#4a5568")
    for lx in range(x + 33, x + 46, 5):
        t.penup(); t.goto(lx, y - 13); t.dot(3, AIRSHIP_GLOW)


def draw_background_city():
    x = -400
    while x < 400:
        w, h = random.randint(40, 75), random.randint(90, 220)
        draw_box(x, -160, w, h, L1_COLOR); x += w - 5


def draw_foreground_city():
    buildings = [
        (-380, 190, 50, "dome"), (-330, 260, 60, "spire"), (-270, 210, 55, "flat"),
        (-215, 320, 65, "bridge"), (-150, 240, 50, "flat"), (-95, 350, 70, "spire"),
        (-25, 200, 55, "dome"), (30, 290, 60, "flat"), (90, 230, 50, "spire"),
        (145, 310, 70, "bridge"), (215, 220, 55, "dome"), (270, 270, 60, "flat"),
        (330, 200, 55, "spire")
    ]
    for x, h, w, style in buildings:
        col = random.choice(L2_COLORS)
        draw_box(x, -160, w, h, col)

        cols, rows = max(1, (w - 12) // 10), max(1, (h - 25) // 14)
        margin = (w - (cols * 10 - 4)) / 2
        for r in range(rows):
            for c in range(cols):
                draw_box(x + margin + c * 10, -145 + r * 14, 5, 8, random.choice(WINS))

        top_y, cx = -160 + h, x + w / 2
        if style == "spire":
            t.penup(); t.goto(cx - 8, top_y); t.color(col); t.begin_fill()
            t.goto(cx, top_y + 55); t.goto(cx + 8, top_y); t.end_fill()
            t.goto(cx, top_y + 55); t.dot(6, "#ff6b6b")
        elif style == "dome":
            t.penup(); t.goto(cx, top_y); t.color(col); t.begin_fill(); t.circle(w * 0.35, 180); t.end_fill()
        elif style == "bridge":
            draw_box(cx - w * 0.4, top_y, w * 0.8, 15, col)
            t.penup(); t.goto(cx - w * 0.3, top_y + 15); t.pendown(); t.pensize(2); t.color("#00b4d8"); t.goto(cx, top_y + 35); t.goto(cx + w * 0.3, top_y + 15); t.pensize(1)


def draw_water_and_reflections():
    draw_box(-400, -300, 800, 140, WATER)
    for _ in range(60):
        t.penup(); t.goto(random.randint(-385, 385), random.randint(-290, -170))
        t.color(random.choice(["#ffd369", "#00b4d8", "#ff6b6b", "#322765"]))
        t.pensize(random.randint(1, 2)); t.pendown(); t.forward(random.randint(12, 45))
    t.pensize(1)


def main():
    draw_sky_and_stars()
    draw_moon(-250, 200)
    draw_airship(120, 220)
    draw_background_city()
    draw_foreground_city()
    draw_water_and_reflections()
    turtle.update()
    turtle.done()


if __name__ == "__main__":
    main()
