import turtle
import random

random.seed(42)
s = turtle.Screen()
s.setup(900, 600)
s.bgcolor("#0a0e1a")
s.title("MIMO V2.5")
s.tracer(0)
t = turtle.Turtle()
t.hideturtle()
t.speed(0)
t.penup()

C = {"bld": ["#0d1117", "#141b26", "#1a2332", "#111827"],
     "lit": ["#f5c842", "#e8a631", "#f0d060"],
     "off": "#1a2030", "water": "#0f1729"}


def box(x, y, w, h, c):
    t.goto(x, y); t.pencolor(c); t.fillcolor(c)
    t.pendown(); t.begin_fill()
    for _ in range(2): t.forward(w); t.left(90); t.forward(h); t.left(90)
    t.end_fill(); t.penup()


def moon(x, y, r):
    t.pencolor("#e8dfc8"); t.fillcolor("#e8dfc8")
    t.goto(x - r, y); t.pendown(); t.begin_fill(); t.circle(r); t.end_fill(); t.penup()
    t.pencolor("#0a0e1a"); t.fillcolor("#0a0e1a")
    t.goto(x - r, y + 8); t.pendown(); t.begin_fill(); t.circle(r - 4); t.end_fill(); t.penup()


def stars():
    for _ in range(80):
        a = random.randint(160, 255); c = f"#{a:02x}{a:02x}{a:02x}"
        t.goto(random.randint(-430, 430), random.randint(120, 280))
        t.pencolor(c); t.dot(random.choice([1, 1, 2, 2, 3]))


def building(x, y, w, h):
    c = random.choice(C["bld"]); box(x, y, w, h, c)
    cols = max(1, int((w - 8) / 10)); rows = max(1, int((h - 12) / 14))
    sx = x + (w - cols * 10 + 4) / 2; sy = y + h - 16
    for r in range(rows):
        for c2 in range(cols):
            wx = sx + c2 * 10; wy = sy - r * 14
            box(wx, wy, 6, 8, random.choice(C["lit"]) if random.random() < 0.45 else C["off"])


def water(y):
    box(-450, y, 900, -120, C["water"])
    for _ in range(60):
        a = random.randint(8, 25); c = f"#{a:02x}{a+8:02x}{a+16:02x}"
        t.pencolor(c); t.goto(random.randint(-440, 440), y - random.randint(4, 100))
        t.pendown(); t.setheading(0); t.forward(random.randint(20, 80)); t.penup()


def accent(y):
    for _ in range(6):
        a = random.randint(15, 30); c = f"#{a:02x}{a+40:02x}{a+60:02x}"
        t.pencolor(c); t.goto(random.randint(-200, 200), y - random.randint(10, 60))
        t.pendown(); t.setheading(0)
        for _ in range(3): t.forward(random.randint(15, 30)); t.right(10)
        for _ in range(3): t.forward(random.randint(15, 30)); t.left(10)
        t.penup()


wy = -180
moon(250, 200, 30); stars()
for bx, bw, bh in [(-440,55,200), (-380,45,140), (-320,70,260), (-240,50,170),
          (-180,80,300), (-90,60,150), (-20,75,280), (60,50,190),
          (110,65,320), (180,55,160), (240,70,240), (310,60,200), (370,50,150)]:
    building(bx, wy, bw, bh)
water(wy); accent(wy)
s.update(); turtle.done()
