/** Fixture: explicit if/else — untested else must lower branch %. */
export function pick(flag: boolean): "a" | "b" {
  if (flag) {
    return "a"
  } else {
    return "b"
  }
}
