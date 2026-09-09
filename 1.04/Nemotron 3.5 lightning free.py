import turtle
import random
from turtle import tracer, done

# ── Configuration ──────────────────────────────────────────────
WIDTH, HEIGHT = 800, 600
turtle.setup(WIDTH + 40, HEIGHT + 40)
turtle.bgcolor("#0b0d17")
turtle.title("Nemotron 3.5")
tracer(0)

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# ── Color palette ──────────────────────────────────────────────
SKY       = "#0b0d17"
MOON      = "#f5f0e2"
MOON_SHADOW = "#4a3b2a"
STAR      = "#ffd580"
STAR_ACC  = "#ffb84d"
CITY_BG   = "#1a1d32"
BUILDING  = "#2d3246"
WINDOW_L  = "#faffc5"
WINDOW_D  = "#1a1d32"
ACCENT    = "#00d4aa"


# ── Turtle helpers ─────────────────────────────────────────────
def make_turtle(shape="classic", color="white", visible=True):
    t = turtle.Turtle()
    t.shape(shape)
    t.color(color)
    t.penup()
    if not visible:
        t.hideturtle()
    t.speed("fastest")
    return t


sky = make_turtle()
city = make_turtle()
win = make_turtle()
star_t = make_turtle()


def goto(t, x, y):
    t.goto(x, y)


# ── Sky: moon + stars ──────────────────────────────────────────
def draw_moon(t, cx, cy, r):
    t.fillcolor(MOON)
    t.pencolor(MOON)
    goto(t, cx, cy - r)
    t.pendown()
    t.begin_fill()
    t.circle(r)
    t.end_fill()
    t.penup()

    for _ in range(3):
        cxr = cx - r // 2 + random.randint(0, r // 2)
        cyr = cy - r // 3 + random.randint(0, r // 2)
        cr = random.randint(8, 16)
        goto(t, cxr, cyr - cr)
        t.pendown()
        t.fillcolor(MOON_SHADOW)
        t.pencolor(MOON_SHADOW)
        t.begin_fill()
        t.circle(cr)
        t.end_fill()
        t.penup()


def draw_stars(t, count=30, min_r=1, max_r=3):
    for _ in range(count):
        x = random.randint(-WIDTH // 2 + 40, WIDTH // 2 - 40)
        y = random.randint(HEIGHT // 2 - 60, HEIGHT // 2)
        r = random.randint(min_r, max_r)
        goto(t, x, y)
        t.fillcolor(STAR)
        t.pencolor(STAR)
        t.begin_fill()
        t.circle(r)
        t.end_fill()


# ── Accent: subtle glowing horizon line ────────────────────────
def draw_horizon_accent(t):
    t.goto(-WIDTH // 2, 0)
    t.pendown()
    t.pensize(2)
    t.color(ACCENT)
    t.goto(WIDTH // 2, 0)
    t.penup()

    # small rectangles along the ground line
    for x in range(-WIDTH // 2 + 40, WIDTH // 2, 60):
        t.goto(x, 0)
        t.begin_fill()
        t.goto(x + 30, 0)
        t.goto(x + 30, -8)
        t.goto(x, -8)
        t.end_fill()


# ── Buildings ──────────────────────────────────────────────────
def draw_building(t, x_left, x_right, y_bottom, y_top, lit_frac=0.5):
    t.fillcolor(BUILDING)
    t.pencolor(BUILDING)
    goto(t, x_left, y_bottom)
    t.pendown()
    t.begin_fill()
    goto(t, x_right, y_bottom)
    goto(t, x_right, y_top)
    goto(t, x_left, y_top)
    goto(t, x_left, y_bottom)
    t.end_fill()
    t.penup()

    window_w = 20
    window_h = 12
    rows = (y_top - y_bottom) // (window_h + 4)
    cols = (x_right - x_left) // (window_w + 4)

    for row in range(rows):
        for col in range(cols):
            wx = x_left + 4 + col * (window_w + 4)
            wy = y_bottom + 4 + row * (window_h + 4)
            lit = random.random() < lit_frac
            t.fillcolor(WINDOW_L if lit else WINDOW_D)
            t.pencolor(WINDOW_L if lit else WINDOW_D)
            goto(t, wx, wy)
            t.pendown()
            t.begin_fill()
            goto(t, wx + window_w, wy)
            goto(t, wx + window_w, wy + window_h)
            goto(t, wx, wy + window_h)
            goto(t, wx, wy)
            t.end_fill()
            t.penup()


# ── Water reflection ────────────────────────────────────────────
def draw_water(t, y):
    t.goto(-WIDTH // 2, y)
    t.fillcolor("#0a0c1a")
    t.pencolor("#0a0c1a")
    t.pendown()
    t.begin_fill()
    goto(t, WIDTH // 2, y)
    goto(t, WIDTH // 2, y - 100)
    goto(t, -WIDTH // 2, y - 100)
    goto(t, -WIDTH // 2, y)
    t.end_fill()
    t.penup()
    for _ in range(40):
        x = random.randint(-WIDTH // 2, WIDTH // 2)
        wy = y - random.randint(5, 90)
        w = random.randint(15, 60)
        a = random.randint(8, 20)
        c = f"#{a:02x}{a+4:02x}{a+12:02x}"
        t.goto(x, wy)
        t.pencolor(c)
        t.pendown()
        t.setheading(0)
        t.forward(w)
        t.penup()


# ── Main scene ──────────────────────────────────────────────────
draw_moon(sky, 260, 200, 35)
draw_stars(star_t, count=50)
draw_horizon_accent(city)

water_y = -30
buildings = [
    (-380, -330, water_y, 180), (-320, -260, water_y, 260),
    (-250, -190, water_y, 150), (-180, -120, water_y, 300),
    (-110, -50, water_y, 200), (-40, 30, water_y, 340),
    (40, 110, water_y, 220), (120, 180, water_y, 280),
    (190, 250, water_y, 170), (260, 330, water_y, 250),
    (340, 390, water_y, 190),
]
for bl, br, bb, bt in buildings:
    draw_building(city, bl, br, bb, bt, lit_frac=0.45)

draw_water(city, water_y)

# ── Shooting star accent ────────────────────────────────────────
sx, sy = random.randint(50, 300), random.randint(220, 280)
star_t.goto(sx, sy)
star_t.pencolor("#ffffff")
star_t.pensize(2)
star_t.pendown()
star_t.setheading(210)
star_t.forward(random.randint(50, 80))
star_t.penup()
star_t.pensize(1)

done()