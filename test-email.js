require("dotenv").config();

const watches = require("./config/watches");
const {
  sendChangeEmail
} = require("./services/email");

async function main() {
  const watch = watches[0];

  const testShowtime = {
    time: "7:00pm",
    datetime: new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString(),
    status: "Available",
    url:
      "https://www.amctheatres.com/movie-theatres/" +
      "new-york-city/amc-lincoln-square-13/showtimes"
  };

  const result = await sendChangeEmail({
    watch,
    current: {
      checkedAt: new Date().toISOString(),
      showtimes: [testShowtime]
    },
    changes: [
      {
        type: "NEW_SHOWTIME",
        time: testShowtime.time,
        current: testShowtime
      }
    ]
  });

  console.log("Test email sent:");
  console.log(result);
}

main().catch((error) => {
  console.error("Test failed:");
  console.error(error);
  process.exit(1);
});
