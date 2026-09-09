"""Stylized city skyline at night, drawn with turtle."""
import random
import turtle

random.seed(42)

NIGHT_SKY = "#0b1130"
MOON = "#f4ecd8"
STAR = "#fdf6e3"
BUILDING_SHADES = ["#1c2541", "#141b31", "#232f52", "#0f1730"]
WINDOW_LIT = "#f6c453"
WINDOW_DARK = "#0a0f24"
ACCENT = "#e8734a"

WIDTH, HEIGHT = 900, 600
GROUND_Y = -250


def setup():
    screen = turtle.Screen()
    screen.setup(WIDTH + 40, HEIGHT + 40)
    screen.bgcolor(NIGHT_SKY)
    screen.title("Sonnet 5")
    screen.tracer(0, 0)
    t = turtle.Turtle()
    t.hideturtle()
    t.speed(0)
    t.penup()
    return screen, t


def draw_rect(t, x, y, w, h, color):
    t.penup()
    t.goto(x, y)
    t.setheading(0)
    t.pendown()
    t.fillcolor(color)
    t.begin_fill()
    for side in (w, h, w, h):
        t.forward(side)
        t.left(90)
    t.end_fill()
    t.penup()


def draw_moon(t, x, y, r):
    t.goto(x, y - r)
    t.setheading(0)
    t.pendown()
    t.fillcolor(MOON)
    t.begin_fill()
    t.circle(r)
    t.end_fill()
    t.penup()
    # crescent shadow bite
    t.goto(x - r * 0.6, y - r)
    t.pendown()
    t.fillcolor(NIGHT_SKY)
    t.begin_fill()
    t.circle(r * 0.9)
    t.end_fill()
    t.penup()


def draw_stars(t, count):
    for _ in range(count):
        x = random.randint(-WIDTH // 2 + 10, WIDTH // 2 - 10)
        y = random.randint(0, HEIGHT // 2 - 20)
        size = random.choice([2, 2, 3])
        t.goto(x, y)
        t.pendown()
        t.dot(size, STAR)
        t.penup()


def draw_windows(t, x, y, w, h):
    cols = max(2, int(w // 22))
    rows = max(2, int(h // 26))
    margin_x, margin_y = w / (cols * 2), h / (rows * 2)
    for r in range(rows):
        for c in range(cols):
            wx = x + margin_x + c * (w / cols) - 4
            wy = y + margin_y + r * (h / rows) - 5
            lit = random.random() < 0.45
            color = WINDOW_LIT if lit else WINDOW_DARK
            draw_rect(t, wx, wy, 8, 10, color)


def draw_building(t, x, w, h):
    color = random.choice(BUILDING_SHADES)
    draw_rect(t, x, GROUND_Y, w, h, color)
    draw_windows(t, x, GROUND_Y, w, h)


def draw_antenna(t, x, base_h, height):
    t.goto(x, GROUND_Y + base_h)
    t.setheading(90)
    t.pendown()
    t.pencolor(ACCENT)
    t.width(2)
    t.forward(height)
    t.penup()
    t.dot(6, ACCENT)
    t.width(1)


def draw_skyline(t):
    x = -WIDTH / 2
    while x < WIDTH / 2:
        w = random.randint(50, 100)
        h = random.randint(120, 340)
        draw_building(t, x, w, h)
        x += w + random.randint(4, 14)
    draw_antenna(t, -30, 340, 60)


def main():
    screen, t = setup()
    draw_stars(t, 140)
    draw_moon(t, 300, 200, 45)
    draw_skyline(t)
    screen.update()
    turtle.done()


if __name__ == "__main__":
    main()
