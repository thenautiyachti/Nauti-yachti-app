// The gate code and the dock address go to whatever these functions return, so
// they are worth pinning hard.
const { normalizePhone, prettyPhone, isDialable, bookingPhones, addPhone, removePhone, makePrimary } =
  require("../lib/bookingPhones");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

console.log("\n  ONE NUMBER, MANY SPELLINGS\n");
ok("bare ten digits", normalizePhone("7135156135"), "+17135156135");
ok("the way a person writes it", normalizePhone("(713) 515-6135"), "+17135156135");
ok("dashes", normalizePhone("713-515-6135"), "+17135156135");
ok("already E.164", normalizePhone("+17135156135"), "+17135156135");
ok("leading 1", normalizePhone("1 713 515 6135"), "+17135156135");
ok("nothing is null, not empty string", normalizePhone(""), null);
ok("undefined is null", normalizePhone(undefined), null);
ok("letters alone are null", normalizePhone("call me"), null);

console.log("\n  READABLE BEFORE YOU TAP\n");
ok("formats", prettyPhone("+17135156135"), "(713) 515-6135");
ok("the party member's number", prettyPhone("+18653824319"), "(865) 382-4319");
ok("a number it cannot format survives as typed", prettyPhone("+4477009"), "+4477009");
ok("ten digits is dialable", isDialable("7135156135"), true);
ok("seven digits is not", isDialable("5156135"), false);

console.log("\n  EVERY NUMBER ON THE BOOKING\n");
const oscar = {
  guestName: "Oscar RoblesGil R",
  phone: "+17135156135",
  phonesJson: JSON.stringify([{ number: "+18653824319", label: "in the party" }]),
};
ok("primary first, then extras", bookingPhones(oscar), [
  { number: "+17135156135", label: "Oscar (booked it)", primary: true },
  { number: "+18653824319", label: "in the party", primary: false },
]);
ok("no extras is just the primary", bookingPhones({ guestName: "Haley", phone: "7135156135" }),
  [{ number: "+17135156135", label: "Haley (booked it)", primary: true }]);
ok("no phone at all is an empty list", bookingPhones({ guestName: "Nobody" }), []);
// A booking with no name still has to render something above the number.
ok("nameless booking still labels the primary", bookingPhones({ phone: "7135156135" }),
  [{ number: "+17135156135", label: "on the booking", primary: true }]);

console.log("\n  THE SAME PHONE TWICE IS ONE PHONE\n");
// Texting a gate code twice to the same person is the mild version. The real
// reason is that a duplicate makes the list look like two contactable people.
ok("duplicate of the primary is dropped", bookingPhones({
  guestName: "Oscar R", phone: "+17135156135",
  phonesJson: JSON.stringify([{ number: "713-515-6135", label: "typed again" }]),
}), [{ number: "+17135156135", label: "Oscar (booked it)", primary: true }]);
ok("duplicate among extras is dropped", bookingPhones({
  phone: "+17135156135",
  phonesJson: JSON.stringify([{ number: "8653824319", label: "a" }, { number: "+18653824319", label: "b" }]),
}).length, 2);

console.log("\n  A BROKEN COLUMN MUST NOT TAKE THE PAGE DOWN\n");
ok("unparseable JSON falls back to the primary", bookingPhones({ phone: "7135156135", phonesJson: "{{{" }),
  [{ number: "+17135156135", label: "on the booking", primary: true }]);
ok("an object where an array belongs", bookingPhones({ phone: "7135156135", phonesJson: '{"a":1}' }).length, 1);
ok("a bare string entry is accepted", bookingPhones({ phone: "7135156135", phonesJson: '["8653824319"]' }).length, 2);
ok("entries with no number are skipped",
  bookingPhones({ phone: "7135156135", phonesJson: '[{"label":"no number"}]' }).length, 1);

console.log("\n  ADDING\n");
ok("adds an extra", JSON.parse(addPhone(oscar, "281-555-0111", "wife")),
  [{ number: "+18653824319", label: "in the party" }, { number: "+12815550111", label: "wife" }]);
ok("re-adding an existing extra relabels rather than duplicates",
  JSON.parse(addPhone(oscar, "8653824319", "Marco")), [{ number: "+18653824319", label: "Marco" }]);
// Adding the primary again would show the same number in the list twice.
ok("adding the primary is a no-op on extras",
  JSON.parse(addPhone(oscar, "7135156135", "Oscar")), [{ number: "+18653824319", label: "in the party" }]);
ok("garbage does not clear what is there", addPhone(oscar, "abc", "x"), oscar.phonesJson);

console.log("\n  REMOVING\n");
ok("removes an extra", removePhone(oscar, "8653824319"),
  { phone: "+17135156135", phonesJson: null });
// Losing the primary must not strand a booking with unreachable extras.
ok("removing the primary PROMOTES the next number", removePhone(oscar, "7135156135"),
  { phone: "+18653824319", phonesJson: null });
ok("removing the only number leaves nothing", removePhone({ phone: "7135156135" }, "7135156135"),
  { phone: null, phonesJson: null });
ok("removing a number that is not there changes nothing",
  removePhone(oscar, "9995550000"), { phone: "+17135156135", phonesJson: oscar.phonesJson });

console.log("\n  PROMOTING — THE ACTUAL FIX FOR OSCAR\n");
// The right number was on the booking all along, just not the one being texted.
const promoted = makePrimary(oscar, "8653824319");
ok("the chosen number becomes primary", promoted.phone, "+18653824319");
ok("the old primary is kept, not discarded", JSON.parse(promoted.phonesJson),
  [{ number: "+17135156135", label: "was on the booking" }]);
ok("promoting the number already primary is a no-op",
  makePrimary(oscar, "7135156135").phone, "+17135156135");
ok("promoting garbage leaves the booking alone",
  makePrimary(oscar, "nonsense").phone, "+17135156135");
// Round trip: promote then promote back, and nothing is lost.
const back = makePrimary({ guestName: "Oscar R", ...promoted }, "7135156135");
ok("promoting back restores the original primary", back.phone, "+17135156135");
ok("and the party member is still on the booking",
  JSON.parse(back.phonesJson).map((e) => e.number), ["+18653824319"]);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
