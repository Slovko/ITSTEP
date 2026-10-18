(() => {
  const digital = document.querySelector("#clockDigital");
  if (!digital) return;

  const formatter = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  function updateClock() {
    const now = new Date();
    digital.textContent = formatter.format(now);
    digital.dateTime = now.toISOString();
  }

  updateClock();
  setInterval(updateClock, 1000);
})();
