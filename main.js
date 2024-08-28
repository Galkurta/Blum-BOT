const axios = require("axios");
const fs = require("fs");
const path = require("path");
const colors = require("colors");
const readline = require("readline");
const { DateTime } = require("luxon");

class GameBot {
  constructor() {
    this.queryId = null;
    this.token = null;
    this.userInfo = null;
    this.currentGameId = null;
    this.firstAccountEndTime = null;
  }

  log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}] ${msg}`.green);
        break;
      case "error":
        console.log(`[${timestamp}] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}] ${msg}`.blue);
    }
  }

  async headers(token = null) {
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://telegram.blum.codes",
      referer: "https://telegram.blum.codes/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async getNewToken() {
    const url =
      "https://gateway.blum.codes/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP";
    const data = JSON.stringify({ query: this.queryId });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(url, data, {
          headers: await this.headers(),
        });
        if (response.status === 200) {
          // Remove the login success message from here
          this.token = response.data.token.refresh;
          return this.token;
        } else {
          this.log(JSON.stringify(response.data), "warning");
          this.log(`Get failed token, try again ${attempt}`, "warning");
        }
      } catch (error) {
        this.log(
          `Get failed token, try again${attempt}: ${error.message}`,
          "error"
        );
        this.log(error.toString(), "error");
      }
    }
    this.log("Take token failed after 3 trials.", "error");
    return null;
  }

  async getUserInfo() {
    try {
      const response = await axios.get(
        "https://gateway.blum.codes/v1/user/me",
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        this.userInfo = response.data;
        return this.userInfo;
      } else {
        const result = response.data;
        if (result.message === "Token is invalid") {
          this.log("Token is invalid, getting new token...", "warning");
          const newToken = await this.getNewToken();
          if (newToken) {
            this.log("Got new token, retrying...", "info");
            return this.getUserInfo();
          } else {
            this.log("Failed to get new token.", "error");
            return null;
          }
        } else {
          this.log("Unable to get user information", "error");
          return null;
        }
      }
    } catch (error) {
      this.log(`Unable to get user information: ${error.message}`, "error");
      return null;
    }
  }

  async getBalance() {
    try {
      const response = await axios.get(
        "https://game-domain.blum.codes/api/v1/user/balance",
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to get balance information: ${error.message}`, "error");
      return null;
    }
  }

  async playGame() {
    const data = JSON.stringify({ game: "example_game" });
    try {
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/game/play",
        data,
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        this.currentGameId = response.data.gameId;
        return response.data;
      } else {
        this.log("Unable to play game", "error");
        return null;
      }
    } catch (error) {
      this.log(`Unable to play game: ${error.message}`, "error");
      return null;
    }
  }

  async claimGame(points) {
    if (!this.currentGameId) {
      this.log("No current gameId to claim.", "warning");
      return null;
    }

    const data = JSON.stringify({ gameId: this.currentGameId, points: points });
    try {
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/game/claim",
        data,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to claim game reward: ${error.message}`, "error");
      this.log(error.toString(), "error");
      return null;
    }
  }

  async claimBalance() {
    try {
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/farming/claim",
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to claim balance: ${error.message}`, "error");
      return null;
    }
  }

  async startFarming() {
    const data = JSON.stringify({ action: "start_farming" });
    try {
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/farming/start",
        data,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to start farming: ${error.message}`, "error");
      return null;
    }
  }

  async checkBalanceFriend() {
    try {
      const response = await axios.get(
        `https://gateway.blum.codes/v1/friends/balance`,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to check friend's balance: ${error.message}`, "error");
      return null;
    }
  }

  async claimBalanceFriend() {
    try {
      const response = await axios.post(
        `https://gateway.blum.codes/v1/friends/claim`,
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(`Unable to claim friend's balance!`, "error");
      return null;
    }
  }

  async checkDailyReward() {
    try {
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/daily-reward?offset=-420",
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      this.log(
        `You have already checked in or unable to check in daily!`,
        "error"
      );
      return null;
    }
  }

  async animatedCountdown(seconds) {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frameIndex = 0;
    for (let i = Math.floor(seconds); i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(
        `${frames[frameIndex]} Waiting ${i} seconds to continue...`.cyan
      );
      frameIndex = (frameIndex + 1) % frames.length;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }

  async getTasks() {
    try {
      const response = await axios.get(
        "https://game-domain.blum.codes/api/v1/tasks",
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        return response.data;
      } else {
        this.log("Unable to get task list", "error");
        return [];
      }
    } catch (error) {
      this.log(`Unable to get task list: ${error.message}`, "error");
      return [];
    }
  }

  async startTask(taskId) {
    try {
      const response = await axios.post(
        `https://game-domain.blum.codes/api/v1/tasks/${taskId}/start`,
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async claimTask(taskId) {
    try {
      const response = await axios.post(
        `https://game-domain.blum.codes/api/v1/tasks/${taskId}/claim`,
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  askQuestion(query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) =>
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
      })
    );
  }

  async main() {
    const dataFile = path.join(__dirname, "data.txt");
    const queryIds = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

    const doTasks = await this.askQuestion(
      "Do you want to complete tasks? (y/n): "
    );
    const shouldDoTasks = doTasks.toLowerCase() === "y";

    while (true) {
      for (let i = 0; i < queryIds.length; i++) {
        this.queryId = queryIds[i];

        const token = await this.getNewToken();
        if (!token) {
          this.log("Unable to get token, skipping this account", "error");
          continue;
        }

        const userInfo = await this.getUserInfo();
        if (userInfo === null) {
          this.log(
            "Unable to get user information, skipping this account",
            "error"
          );
          continue;
        }

        console.log(`${"["} Account ${i + 1} | ${userInfo.username} ${"]"}`);
        this.log("Login successful", "success");

        const balanceInfo = await this.getBalance();
        if (balanceInfo) {
          this.log("Getting information....", "info");
          console.log(
            `${"Balance:".padEnd(20)} ${balanceInfo.availableBalance}`.green
          );
          console.log(
            `${"Game passes:".padEnd(20)} ${balanceInfo.playPasses}`.green
          );
          if (!balanceInfo.farming) {
            const farmingResult = await this.startFarming();
            if (farmingResult) {
              this.log("Successfully started farming!", "success");
            }
          } else {
            const endTime = DateTime.fromMillis(balanceInfo.farming.endTime);
            const formattedEndTime = endTime
              .setZone("Asia/Jakarta")
              .toFormat("dd/MM/yyyy HH:mm:ss");
            console.log(
              `${"Farming end time:".padEnd(20)} ${formattedEndTime}`.cyan
            );
            if (i === 0) {
              this.firstAccountEndTime = endTime;
            }
            const currentTime = DateTime.now();
            if (currentTime > endTime) {
              const claimBalanceResult = await this.claimBalance();
              if (claimBalanceResult) {
                this.log("Successfully claimed farm!", "success");
              }

              const farmingResult = await this.startFarming();
              if (farmingResult) {
                this.log("Successfully started farming!", "success");
              }
            } else {
              const timeLeft = endTime.diff(currentTime).toFormat("hh:mm:ss");
              console.log(
                `${"Time left for farming:".padEnd(20)} ${timeLeft}`.cyan
              );
            }
          }
        } else {
          this.log("Unable to get balance information", "error");
        }

        if (shouldDoTasks) {
          const taskListResponse = await this.getTasks();

          if (
            taskListResponse &&
            Array.isArray(taskListResponse) &&
            taskListResponse.length > 0
          ) {
            let allTasks = taskListResponse.flatMap(
              (section) => section.tasks || []
            );

            this.log("Retrieved task list", "info");

            const excludedTaskId = "5daf7250-76cc-4851-ac44-4c7fdcfe5994";
            allTasks = allTasks.filter((task) => task.id !== excludedTaskId);
            console.log(`${"Total tasks:".padEnd(20)} ${allTasks.length}`.cyan);
            const notStartedTasks = allTasks.filter(
              (task) => task.status === "NOT_STARTED"
            );
            console.log(
              `${"Tasks not started:".padEnd(20)} ${notStartedTasks.length}`
                .cyan
            );
            for (const task of notStartedTasks) {
              this.log(`Starting task: ${task.title}`, "info");

              const startResult = await this.startTask(task.id);
              if (startResult) {
                this.log(`Started task: ${task.title}`, "success");
              } else {
                continue;
              }

              await this.animatedCountdown(3);

              const claimResult = await this.claimTask(task.id);
              if (claimResult && claimResult.status === "FINISHED") {
                this.log(
                  `Completed task ${task.title.yellow}${
                    `... status: success!`.green
                  }`,
                  "success"
                );
              } else {
                this.log(
                  `Unable to claim reward for task: ${task.title.yellow}`,
                  "error"
                );
              }
            }
          } else {
            this.log("Unable to get task list or task list is empty", "error");
          }
        }

        const dailyRewardResult = await this.checkDailyReward();
        if (dailyRewardResult) {
          this.log("Claimed daily reward!", "success");
        }

        const friendBalanceInfo = await this.checkBalanceFriend();
        if (friendBalanceInfo) {
          console.log(
            `${"Friend's balance:".padEnd(20)} ${
              friendBalanceInfo.amountForClaim
            }`.cyan
          );
          if (friendBalanceInfo.amountForClaim > 0) {
            const claimFriendBalanceResult = await this.claimBalanceFriend();
            if (claimFriendBalanceResult) {
              this.log("Successfully claimed friend's balance!", "success");
            }
          } else {
            this.log("No friend's balance to claim!", "info");
          }
        } else {
          this.log("Unable to check friend's balance!", "error");
        }

        if (balanceInfo && balanceInfo.playPasses > 0) {
          for (let j = 0; j < balanceInfo.playPasses; j++) {
            let playAttempts = 0;
            const maxAttempts = 5;

            while (playAttempts < maxAttempts) {
              try {
                const playResult = await this.playGame();
                if (playResult) {
                  this.log(`Starting game ${j + 1}...`, "success");
                  await this.animatedCountdown(30);
                  const claimGameResult = await this.claimGame(2000);
                  if (claimGameResult) {
                    this.log(
                      `Successfully claimed reward for game ${j + 1}!`,
                      "success"
                    );
                  }
                  break;
                }
              } catch (error) {
                playAttempts++;
                this.log(
                  `Unable to play game ${j + 1}, attempt ${playAttempts}: ${
                    error.message
                  }`,
                  "warning"
                );
                if (playAttempts < maxAttempts) {
                  this.log(`Retrying...`, "info");
                  await this.animatedCountdown(5);
                } else {
                  this.log(
                    `Failed after ${maxAttempts} attempts, skipping this game`,
                    "error"
                  );
                }
              }
            }
          }
        } else {
          this.log("No game passes available", "info");
        }

        this.log(
          `Completed processing account ${userInfo.username}`,
          "success"
        );
      }

      if (this.firstAccountEndTime) {
        const currentTime = DateTime.now();
        const timeLeft = this.firstAccountEndTime
          .diff(currentTime)
          .as("seconds");

        if (timeLeft > 0) {
          await this.animatedCountdown(timeLeft);
        } else {
          this.log("Waiting 10 minutes before starting a new round...", "info");
          await this.animatedCountdown(600);
        }
      } else {
        this.log("Waiting 10 minutes before starting a new round...", "info");
        await this.animatedCountdown(600);
      }
    }
  }
}

if (require.main === module) {
  const gameBot = new GameBot();
  gameBot.main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
