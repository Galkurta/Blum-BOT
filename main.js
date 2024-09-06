const axios = require("axios");
const fs = require("fs");
const path = require("path");
const colors = require("colors");
const readline = require("readline");
const { DateTime } = require("luxon");
const { Mutex } = require("async-mutex");
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("worker_threads");

const consoleMutex = new Mutex();

class GameBot {
  constructor(threadNumber) {
    this.threadNumber = threadNumber;
    this.queryId = null;
    this.token = null;
    this.userInfo = null;
    this.currentGameId = null;
    this.username = null;
    this.userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async log(msg, type = "INFO", additionalInfo = "") {
    const timestamp = new Date().toLocaleTimeString();
    let statusMsg;
    switch (type) {
      case "SUCCESS":
        statusMsg = "SUCCESS".green;
        break;
      case "FAILED":
        statusMsg = "FAILED".red;
        break;
      case "WAITING":
        statusMsg = "WAITING".yellow;
        break;
      default:
        statusMsg = "INFO".blue;
    }

    // Pad the statusMsg to ensure consistent width and spacing
    statusMsg = ` ${statusMsg.padEnd(7)} `; // Add space before and after, ensure total width of 9

    const logMessage = `${timestamp} |${statusMsg}| | ${this.threadNumber
      .toString()
      .padStart(3, " ")} | |${this.username}| ${msg} ${additionalInfo}`;

    await consoleMutex.runExclusive(() => {
      console.log(logMessage);
    });

    await this.randomDelay();
  }

  async headers(token = null) {
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://telegram.blum.codes",
      referer: "https://telegram.blum.codes/",
      "user-agent": this.getRandomUserAgent(),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async getNewToken() {
    const url =
      "https://user-domain.blum.codes/api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP";
    const data = JSON.stringify({ query: this.queryId, referralToken: "" });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.randomDelay();
        const response = await axios.post(url, data, {
          headers: await this.headers(),
        });
        if (response.status === 200) {
          await this.log("Login successful", "SUCCESS");
          this.token = response.data.token.refresh;
          return this.token;
        } else {
          await this.log(JSON.stringify(response.data), "FAILED");
          await this.log(
            `Failed to get token, retrying attempt ${attempt}`,
            "FAILED"
          );
        }
      } catch (error) {
        await this.log(
          `Failed to get token, retrying attempt ${attempt}: ${error.message}`,
          "FAILED"
        );
        await this.log(error.toString(), "FAILED");
      }
    }
    await this.log("Failed to get token after 3 attempts.", "FAILED");
    return null;
  }

  async getUserInfo() {
    try {
      await this.randomDelay();
      const response = await axios.get(
        "https://user-domain.blum.codes/api/v1/user/me",
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        this.userInfo = response.data;
        this.username = this.userInfo.username;
        return this.userInfo;
      } else {
        const result = response.data;
        if (result.message === "Token is invalid") {
          await this.log("Invalid token, getting new token...", "FAILED");
          const newToken = await this.getNewToken();
          if (newToken) {
            await this.log("Got new token, retrying...", "INFO");
            return this.getUserInfo();
          } else {
            await this.log("Failed to get new token.", "FAILED");
            return null;
          }
        } else {
          await this.log("Unable to get user info", "FAILED");
          return null;
        }
      }
    } catch (error) {
      await this.log(`Unable to get user info: ${error.message}`, "FAILED");
      return null;
    }
  }

  async getBalance() {
    try {
      await this.randomDelay();
      const response = await axios.get(
        "https://game-domain.blum.codes/api/v1/user/balance",
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(`Unable to get balance info: ${error.message}`, "FAILED");
      return null;
    }
  }

  async playGame() {
    const data = JSON.stringify({ game: "example_game" });
    try {
      await this.randomDelay();
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/game/play",
        data,
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        this.currentGameId = response.data.gameId;
        return response.data;
      } else {
        await this.log("Unable to play game", "FAILED");
        return null;
      }
    } catch (error) {
      await this.log(`Unable to play game: ${error.message}`, "FAILED");
      return null;
    }
  }

  async claimGame(points) {
    if (!this.currentGameId) {
      await this.log("No current gameId to claim.", "FAILED");
      return null;
    }

    const data = JSON.stringify({ gameId: this.currentGameId, points: points });
    try {
      await this.randomDelay();
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/game/claim",
        data,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(`Unable to claim game reward: ${error.message}`, "FAILED");
      await this.log(error.toString(), "FAILED");
      return null;
    }
  }

  async claimBalance() {
    try {
      await this.randomDelay();
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/farming/claim",
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(`Unable to claim balance: ${error.message}`, "FAILED");
      return null;
    }
  }

  async startFarming() {
    const data = JSON.stringify({ action: "start_farming" });
    try {
      await this.randomDelay();
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/farming/start",
        data,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(`Unable to start farming: ${error.message}`, "FAILED");
      return null;
    }
  }

  async checkBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await axios.get(
        `https://user-domain.blum.codes/api/v1/friends/balance`,
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(
        `Unable to check friend balance: ${error.message}`,
        "FAILED"
      );
      return null;
    }
  }

  async claimBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await axios.post(
        `https://user-domain.blum.codes/api/v1/friends/claim`,
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(`Unable to claim friend balance`, "FAILED");
      return null;
    }
  }

  async checkDailyReward() {
    try {
      await this.randomDelay();
      const response = await axios.post(
        "https://game-domain.blum.codes/api/v1/daily-reward?offset=-420",
        {},
        { headers: await this.headers(this.token) }
      );
      return response.data;
    } catch (error) {
      await this.log(
        `You have already checked in or unable to check in daily`,
        "SUCCESS"
      );
      return null;
    }
  }

  async Countdown(seconds) {
    for (let i = Math.floor(seconds); i >= 0; i--) {
      await consoleMutex.runExclusive(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(
          `${new Date().toLocaleTimeString()} | ${this.threadNumber
            .toString()
            .padStart(3, " ")} | |${
            this.username
          }| Waiting ${i} seconds to continue...`
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await consoleMutex.runExclusive(() => {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    });
  }

  async getTasks() {
    try {
      await this.randomDelay();
      const response = await axios.get(
        "https://game-domain.blum.codes/api/v1/tasks",
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        return response.data;
      } else {
        await this.log("Unable to get task list", "FAILED");
        return [];
      }
    } catch (error) {
      await this.log(`Unable to get task list: ${error.message}`, "FAILED");
      return [];
    }
  }

  async startTask(taskId) {
    try {
      await this.randomDelay();
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
      await this.randomDelay();
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

  async joinTribe(tribeId) {
    const url = `https:///tribe-domain.blum.codes/api/v1/tribe/${tribeId}/join`;
    try {
      await this.randomDelay();
      const response = await axios.post(
        url,
        {},
        { headers: await this.headers(this.token) }
      );
      if (response.status === 200) {
        await this.log("You have successfully joined the tribe", "SUCCESS");
        return true;
      }
    } catch (error) {
      if (
        error.response &&
        error.response.data &&
        error.response.data.message === "USER_ALREADY_IN_TRIBE"
      ) {
        await this.log("You have already joined a tribe", "INFO");
      } else {
        await this.log(`Unable to join tribe: ${error.message}`, "FAILED");
      }
      return false;
    }
  }

  formatNextClaimTime(farming) {
    if (!farming) return "N/A";
    const endTime = DateTime.fromMillis(farming.endTime);
    return endTime.toFormat("dd/MM/yyyy HH:mm:ss");
  }

  async processAccount(queryId, shouldPerformTasks) {
    this.queryId = queryId;

    const token = await this.getNewToken();
    if (!token) {
      await this.log("Unable to get token, skipping this account", "FAILED");
      return null;
    }

    const userInfo = await this.getUserInfo();
    if (userInfo === null) {
      await this.log(
        "Unable to get user info, skipping this account",
        "FAILED"
      );
      return null;
    }

    const balanceInfo = await this.getBalance();
    if (balanceInfo) {
      await this.log(
        `${balanceInfo.availableBalance}`,
        "SUCCESS",
        `|Next farming ${this.formatNextClaimTime(balanceInfo.farming)}`
      );

      const tribeId = "6f953956-30d8-48dc-a968-e8a2e562c900";
      await this.joinTribe(tribeId);

      if (!balanceInfo.farming) {
        const farmingResult = await this.startFarming();
        if (farmingResult) {
          await this.log("Successfully started farming", "SUCCESS");
        }
      } else {
        const endTime = DateTime.fromMillis(balanceInfo.farming.endTime);
        const currentTime = DateTime.now();
        if (currentTime > endTime) {
          const claimBalanceResult = await this.claimBalance();
          if (claimBalanceResult) {
            await this.log("Successfully claimed farm", "SUCCESS");
          }

          const farmingResult = await this.startFarming();
          if (farmingResult) {
            await this.log("Successfully started farming", "SUCCESS");
          }
        } else {
          const timeLeft = endTime.diff(currentTime).toFormat("hh:mm:ss");
          await this.log(`Next farming ${timeLeft}`, "WAITING");
        }
      }
    } else {
      await this.log("Unable to get balance info", "FAILED");
    }

    if (shouldPerformTasks) {
      const taskListResponse = await this.getTasks();
      if (
        taskListResponse &&
        Array.isArray(taskListResponse) &&
        taskListResponse.length > 0
      ) {
        let allTasks = taskListResponse.flatMap(
          (section) => section.tasks || []
        );

        const excludedTaskIds = [
          "5daf7250-76cc-4851-ac44-4c7fdcfe5994",
          "3b0ae076-9a85-4090-af55-d9f6c9463b2b",
          "89710917-9352-450d-b96e-356403fc16e0",
          "220ee7b1-cca4-4af8-838a-2001cb42b813",
          "c4e04f2e-bbf5-4e31-917b-8bfa7c4aa3aa",
          "f382ec3f-089d-46de-b921-b92adfd3327a",
          "d3716390-ce5b-4c26-b82e-e45ea7eba258",
          "5ecf9c15-d477-420b-badf-058537489524",
          "d057e7b7-69d3-4c15-bef3-b300f9fb7e31",
          "a4ba4078-e9e2-4d16-a834-02efe22992e2",
        ];

        allTasks = allTasks.filter(
          (task) => !excludedTaskIds.includes(task.id)
        );

        for (const task of allTasks) {
          if (task.status === "NOT_STARTED") {
            const startResult = await this.startTask(task.id);
            if (startResult) {
              const claimResult = await this.claimTask(task.id);
              if (claimResult && claimResult.status === "FINISHED") {
                await this.log(`Completed task ${task.title}`, "SUCCESS");
              } else {
                await this.log(`Failed to claim task: ${task.title}`, "FAILED");
              }
            }
          }
        }
      } else {
        await this.log(
          "Unable to get task list or task list is empty",
          "FAILED"
        );
      }
    }

    const dailyRewardResult = await this.checkDailyReward();
    if (dailyRewardResult) {
      await this.log("Claimed daily reward", "SUCCESS");
    }

    const friendBalanceInfo = await this.checkBalanceFriend();
    if (friendBalanceInfo) {
      await this.log(
        `Friend balance: ${friendBalanceInfo.amountForClaim}`,
        "INFO"
      );
      if (friendBalanceInfo.amountForClaim > 0) {
        const claimFriendBalanceResult = await this.claimBalanceFriend();
        if (claimFriendBalanceResult) {
          await this.log("Successfully claimed friend balance", "SUCCESS");
        }
      } else {
        await this.log("No friend balance to claim", "INFO");
      }
    } else {
      await this.log("Unable to check friend balance", "FAILED");
    }

    if (balanceInfo && balanceInfo.playPasses > 0) {
      for (let j = 0; j < balanceInfo.playPasses; j++) {
        await this.log(`Playing Game: ${j + 1}`, "INFO");
        let playAttempts = 0;
        const maxAttempts = 10;

        while (playAttempts < maxAttempts) {
          try {
            const playResult = await this.playGame();
            if (playResult) {
              await this.Countdown(30);
              const randomNumber =
                Math.floor(Math.random() * (200 - 150 + 1)) + 150;
              const claimGameResult = await this.claimGame(randomNumber);
              if (claimGameResult) {
                await this.log(
                  `Successfully claimed game ${
                    j + 1
                  } reward with ${randomNumber} points`,
                  "SUCCESS"
                );
              }
              break;
            }
          } catch (error) {
            playAttempts++;
            await this.log(
              `Unable to play game ${j + 1}, attempt ${playAttempts}: ${
                error.message
              }`,
              "FAILED"
            );
            if (playAttempts < maxAttempts) {
              await this.log(`Retrying...`, "INFO");
              await this.Countdown(5);
            } else {
              await this.log(
                `Failed after ${maxAttempts} attempts, skipping this game`,
                "FAILED"
              );
            }
          }
        }
      }
    } else {
      await this.log("No game passes available", "INFO");
    }

    await this.log(`Finished processing account ${this.username}`, "SUCCESS");
    return balanceInfo?.farming?.endTime;
  }

  static async askQuestion(query) {
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
}

if (isMainThread) {
  async function main() {
    const dataFile = path.join(__dirname, "data.txt");
    const queryIds = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

    const performTasks = await GameBot.askQuestion(
      "Do you want to perform tasks? (y/n): "
    );
    const shouldPerformTasks = performTasks.toLowerCase() === "y";

    const threadCountInput = await GameBot.askQuestion(
      `Enter the number of threads to use (1-${queryIds.length}): `
    );
    const threadCount = Math.min(
      Math.max(parseInt(threadCountInput) || 1, 1),
      queryIds.length
    );

    console.log(`Using ${threadCount} threads for processing.`);

    async function runWorker(queryId, threadNumber) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { queryId, shouldPerformTasks, threadNumber },
        });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0)
            reject(new Error(`Worker stopped with exit code ${code}`));
        });
      });
    }

    async function processInBatches() {
      for (let i = 0; i < queryIds.length; i += threadCount) {
        const batch = queryIds.slice(i, i + threadCount);
        await Promise.all(
          batch.map((queryId, index) => runWorker(queryId, i + index + 1))
        );
      }
    }

    while (true) {
      console.log("Starting a new round of processing...");
      await processInBatches();
      console.log("All accounts processed. Starting next round immediately.");
    }
  }

  main().catch(console.error);
} else {
  // This code will run in worker threads
  (async () => {
    const bot = new GameBot(workerData.threadNumber);
    const nextClaimTime = await bot.processAccount(
      workerData.queryId,
      workerData.shouldPerformTasks
    );

    if (nextClaimTime) {
      const now = DateTime.now();
      const waitTime = DateTime.fromMillis(nextClaimTime).diff(now);
      if (waitTime.milliseconds > 0) {
        await bot.log(
          `Next claim in ${waitTime.toFormat("hh:mm:ss")}`,
          "WAITING"
        );
        await new Promise((resolve) =>
          setTimeout(resolve, waitTime.milliseconds)
        );
      }
    }

    parentPort.postMessage("done");
  })();
}
