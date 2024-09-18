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
const fakeUserAgent = require("fake-useragent");
const log = require("loglevel");
const prefix = require("loglevel-plugin-prefix");

const consoleMutex = new Mutex();

prefix.reg(log);
prefix.apply(log, {
  format(level, name, timestamp) {
    return `${timestamp} [${level}]`;
  },
});

colors.setTheme({
  debug: "cyan",
  info: "blue",
  warn: "yellow",
  error: "red",
});

const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  SUCCESS: "info",
  WARNING: "warn",
  ERROR: "error",
};

class GameBot {
  constructor(threadNumber) {
    this.threadNumber = threadNumber;
    this.queryId = null;
    this.token = null;
    this.userInfo = null;
    this.currentGameId = null;
    this.username = null;
    this.userAgent = this.getRandomUserAgent();
    this.excludedTasksFile = path.join(__dirname, "excludedTasks.json");
    this.logger = log.getLogger(`Thread-${threadNumber}`);
    this.logger.setLevel("trace");
    this.excludedTasks = this.loadExcludedTasks();
  }

  getRandomUserAgent() {
    return fakeUserAgent();
  }

  loadExcludedTasks() {
    if (fs.existsSync(this.excludedTasksFile)) {
      const data = fs.readFileSync(this.excludedTasksFile, "utf8");
      return JSON.parse(data);
    }
    return [];
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async log(msg, level = "INFO", additionalInfo = "") {
    const logLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    let coloredLevel;
    switch (level) {
      case "SUCCESS":
        coloredLevel = level.green;
        break;
      case "ERROR":
        coloredLevel = level.red;
        break;
      case "WARNING":
        coloredLevel = level.yellow;
        break;
      case "DEBUG":
        coloredLevel = level.cyan;
        break;
      default:
        coloredLevel = level.blue;
    }

    const timestamp = new Date().toLocaleTimeString();
    const usernameDisplay = this.username
      ? this.username.padEnd(12)
      : "".padEnd(12);
    const logMessage = `${timestamp} | ${coloredLevel.padEnd(
      7
    )} | ${this.threadNumber
      .toString()
      .padStart(2, "0")} | ${usernameDisplay} | ${msg} ${additionalInfo}`;

    await consoleMutex.runExclusive(() => {
      this.logger[logLevel](logMessage);
    });

    await this.randomDelay();
  }

  headers(token = null) {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.6",
      "Content-Type": "application/json",
      Origin: "https://major.glados.app/reward",
      Referer: "https://major.glados.app/",
      "Sec-Ch-Ua":
        '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": this.userAgent,
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
          this.token = response.data.token.refresh;
          await this.log("Login successful", "SUCCESS");
          return this.token;
        } else {
          await this.log(JSON.stringify(response.data), "WARNING");
          await this.log(
            `Failed to get token, retrying attempt ${attempt}`,
            "WARNING"
          );
        }
      } catch (error) {
        if (error.response && error.response.status) {
          await this.log(
            `Failed to get token, retrying attempt ${attempt}: Request failed with status ${error.response.status}`,
            "ERROR"
          );
        } else {
          await this.log(
            `Failed to get token, retrying attempt ${attempt}: ${error.message}`,
            "ERROR"
          );
        }
        await this.log(error.toString(), "DEBUG");
      }
    }
    await this.log("Failed to get token after 3 attempts.", "ERROR");
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
          await this.log("Invalid token, getting new token...", "WARNING");
          const newToken = await this.getNewToken();
          if (newToken) {
            await this.log("Got new token, retrying...", "INFO");
            return this.getUserInfo();
          } else {
            await this.log("Failed to get new token.", "ERROR");
            return null;
          }
        } else {
          await this.log("Unable to get user info", "ERROR");
          return null;
        }
      }
    } catch (error) {
      await this.log(`Unable to get user info: ${error.message}`, "ERROR");
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
      await this.log(`Unable to get balance info: ${error.message}`, "ERROR");
      return null;
    }
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
        await this.log("Unable to get task list", "ERROR");
        return [];
      }
    } catch (error) {
      await this.log(`Unable to get task list: ${error.message}`, "ERROR");
      return [];
    }
  }

  async postValidateTask(gameId, keyAnswer) {
    const urlStart = `https://earn-domain.blum.codes/api/v1/tasks/${gameId}/start`;
    const urlValidate = `https://earn-domain.blum.codes/api/v1/tasks/${gameId}/validate`;
    const data = { keyword: `${keyAnswer}` };

    try {
      await this.randomDelay();
      const startResponse = await axios.post(
        urlStart,
        {},
        { headers: await this.headers(this.token) }
      );

      if (startResponse.status === 200) {
        try {
          await this.randomDelay();
          const validateResponse = await axios.post(urlValidate, data, {
            headers: await this.headers(this.token),
          });
          await this.log(
            `Success Task ${gameId} and answer ${keyAnswer}`,
            "SUCCESS"
          );
          return validateResponse.data;
        } catch (error) {
          const errorMessage = `Unable to validate task: ${error.message}`;
          await this.log(errorMessage, "ERROR");
          if (error.response) {
            await this.log(
              `Validate response error: ${JSON.stringify(error.response.data)}`,
              "ERROR"
            );
          }
          return null;
        }
      } else {
        const startErrorMessage = `Failed to start task with status ${startResponse.status}`;
        await this.log(startErrorMessage, "ERROR");

        if (
          startResponse.data &&
          startResponse.data.message === "Task is already started"
        ) {
          await this.log("Task is already started", "INFO");
        } else {
          if (startResponse.data) {
            await this.log(
              `Start response error: ${JSON.stringify(startResponse.data)}`,
              "ERROR"
            );
          }
        }

        try {
          await this.randomDelay();
          const validateResponse = await axios.post(urlValidate, data, {
            headers: await this.headers(this.token),
          });
          await this.log(
            `Success Task ${gameId} and answer ${keyAnswer}`,
            "SUCCESS"
          );
          return validateResponse.data;
        } catch (validateError) {
          await this.log(
            `Unable to validate task after failed start: ${validateError.message}`,
            "ERROR"
          );
          if (validateError.response) {
            await this.log(
              `Validate response error: ${JSON.stringify(
                validateError.response.data
              )}`,
              "ERROR"
            );
          }
          return null;
        }
      }
    } catch (error) {
      const errorMessage = `Unable to start task: ${error.message}`;
      await this.log(errorMessage, "ERROR");
      if (error.response) {
        await this.log(
          `Start request response error: ${JSON.stringify(
            error.response.data
          )}`,
          "ERROR"
        );
      }
      try {
        await this.randomDelay();
        const validateResponse = await axios.post(urlValidate, data, {
          headers: await this.headers(this.token),
        });
        await this.log(
          `Success Task ${gameId} and answer ${keyAnswer}`,
          "SUCCESS"
        );
        return validateResponse.data;
      } catch (validateError) {
        await this.log(
          `Unable to validate task after start error: ${validateError.message}`,
          "ERROR"
        );
        if (validateError.response) {
          await this.log(
            `Validate response error: ${JSON.stringify(
              validateError.response.data
            )}`,
            "ERROR"
          );
        }
        return null;
      }
    }
  }

  async taskNoAnswer(gameId) {
    const urlStart = `https://earn-domain.blum.codes/api/v1/tasks/${gameId}/start`;
    try {
      await this.randomDelay();
      const validateClaim = await axios.post(
        urlStart,
        {},
        { headers: await this.headers(this.token) }
      );
      await this.log(`Success Task ${gameId}`, "SUCCESS");
      return validateClaim.data;
    } catch (error) {
      const errorMessage = `Unable to validate task: ${error.message}`;
      await this.log(errorMessage, "ERROR");
      if (error.response) {
        await this.log(
          `Validate response error: ${JSON.stringify(error.response.data)}`,
          "ERROR"
        );
      }
      return null;
    }
  }

  async claimTaskAll(gameId) {
    const urlClaim = `https://earn-domain.blum.codes/api/v1/tasks/${gameId}/claim`;
    try {
      await this.randomDelay();
      const validateClaim = await axios.post(
        urlClaim,
        {},
        { headers: await this.headers(this.token) }
      );
      await this.log(`Success Task ${gameId} claim`, "SUCCESS");
      return validateClaim.data;
    } catch (error) {
      const errorMessage = `Unable to validate task: ${error.message}`;
      await this.log(errorMessage, "ERROR");
      if (error.response) {
        await this.log(
          `Validate response error: ${JSON.stringify(error.response.data)}`,
          "ERROR"
        );
      }
      return null;
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
        await this.log("Unable to play game", "ERROR");
        return null;
      }
    } catch (error) {
      await this.log(`Unable to play game: ${error.message}`, "ERROR");
      return null;
    }
  }

  async claimGame(points) {
    if (!this.currentGameId) {
      await this.log("No current gameId to claim.", "WARNING");
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
      await this.log(`Unable to claim game reward: ${error.message}`, "ERROR");
      await this.log(error.toString(), "DEBUG");
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
      await this.log(`Unable to claim balance: ${error.message}`, "ERROR");
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
      await this.log(`Unable to start farming: ${error.message}`, "ERROR");
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
        "ERROR"
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
      await this.log(`Unable to claim friend balance`, "ERROR");
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
        "ERROR"
      );
      return null;
    }
  }

  async Countdown(seconds) {
    for (let i = Math.floor(seconds); i >= 0; i--) {
      await consoleMutex.runExclusive(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`Waiting ${i} seconds to continue...`);
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await consoleMutex.runExclusive(() => {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    });
  }

  async taskValidate(gameId, keyword) {
    const url = `https://earn-domain.blum.codes/api/v1/tasks/${gameId}/validate`;
    const payload = { keyword };
    try {
      await this.randomDelay();
      const response = await axios.post(url, payload, {
        headers: await this.headers(this.token),
      });
      if (response.status === 200) {
        await this.log("done vaidate", `SUCCESS ${gameId}`);
        return true;
      }
    } catch (error) {
      return false;
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
        await this.log(`Unable to join tribe: ${error.message}`, "ERROR");
      }
      return false;
    }
  }

  formatNextClaimTime(farming) {
    if (!farming) return "N/A";
    const endTime = DateTime.fromMillis(farming.endTime);
    return endTime.toFormat("dd/MM/yyyy HH:mm:ss");
  }

  async processAccount(queryId) {
    this.queryId = queryId;
    let isCompleted = false;

    const token = await this.getNewToken();
    if (!token) {
      await this.log("Unable to get token, skipping this account", "ERROR");
      return null;
    }

    const userInfo = await this.getUserInfo();
    if (userInfo === null) {
      await this.log("Unable to get user info, skipping this account", "ERROR");
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
          await this.log(`Next farming ${timeLeft}`, "INFO");
        }
      }
    } else {
      await this.log("Unable to get balance info", "ERROR");
    }

    // TASK VALIDATE
    await this.postValidateTask(
      "6af85c01-f68d-4311-b78a-9cf33ba5b151",
      "GO GET"
    );
    await this.postValidateTask(
      "38f6dd88-57bd-4b42-8712-286a06dac0a0",
      "VALUE"
    );
    await this.postValidateTask(
      "d95d3299-e035-4bf6-a7ca-0f71578e9197",
      "BEST PROJECT EVER"
    );
    await this.postValidateTask(
      "53044aaf-a51f-4dfc-851a-ae2699a5f729",
      "HEYBLUM"
    );

    // TASK No Answer
    // await this.taskNoAnswer("39391eb2-f031-4954-bd8a-e7aecbb1f192"); // this task need connet wallet
    const noAnswerTasks = [
      "57761ac3-0745-4cd2-be8b-e4231dfc92b5",
      "2140351e-b0d2-465e-adab-949d1735dc6e",
      "817dbad3-3290-4dc3-aa99-846d5f09d46d",
      "34c97e43-3e25-4240-834a-54e34029ca7a",
      "cb22f8ec-cc2f-49cb-8eb9-add09fad3682",
      "c7432e39-73b4-4cea-9740-f820b11d9da3",
      "33ddee08-2ef4-45ef-b243-8d80c6b32009",
      "3f1502b8-9e87-4b3a-995d-81c135f29f27",
      "1e5faaca-6d17-4f3b-96aa-537a112c1e68",
      "97d50b4c-a070-4136-a41d-390e67b883e0",
      "7ec46833-c5bf-4320-827e-fb04ab740972",
      "4098fa89-3b83-42d6-a987-a9b8a6f40caf",
      "d7accab9-f987-44fc-a70b-e414004e8314",
      "ec566e12-4e18-470a-b425-0242cd7c34d7",
      "760af0c6-f54b-41cc-b566-c51cfeb1e113",
      "a4bebdf8-3014-4c09-9e37-b4d12a183dc1",
      "f7f85b56-3310-4580-be47-7909203206d7",
      "f83c525c-9844-469b-a104-817814f337e7",
      "e075353e-78b0-4204-b713-ae8c6860d688",
      "85f4eaf3-2200-4adf-8fea-c32362319919",
      "ede0f7f9-1dc2-43ae-8a09-5a8f5834ddae",
      "88ac35ee-8c40-4d0d-b310-23e303ada27d",
      "d92d0461-25c4-452f-9c32-a35511316332",
      "c86fa64a-0b63-4deb-84f0-5bfa42c6b47f",
      "ee08bcdb-c297-459e-90b2-0e0a4be1f2d0",
      "bbdd58fd-aa96-487a-b00f-faec45c545c3",
      "16dbcd76-a9a8-4123-967d-a7a0fcd099e8",
      "7c479ea4-110b-4bc0-9e15-a769d6170e84",
      "f0e4827d-f0a6-431e-a8f9-fa74ced77458",
      "84d1a1bc-a914-44c6-bcc0-593d8cbc476b",
      "94640066-4240-466b-8b7c-663ca525878c",
      "24c2fe53-f381-4382-abc8-b5792f8080e7",
      "53044aaf-a51f-4dfc-851a-ae2699a5f729",
      "e05bb747-7d40-4b69-8b99-0f4a9a9305cf",
      "7b1b11eb-ec1e-4677-96b8-1b590b55dcf1",
      "aace23fe-0938-41ee-a77d-f89bee549928",
      "24dd6940-3529-40a4-89e9-cd806bc42708",
      "f542f997-59c1-498c-8612-c58faf4879ac",
      "90acc5fb-a505-4003-9344-9ec7539d23e1",
      "8e2c1d3b-8a33-4dbc-82e1-685b65173150",
      "ee7f9854-7ad7-4d95-9e4a-0ffb4210b0fa",
      "dafe118b-2602-43e7-a489-ebe50ca6ed0d",
      "d478fff3-945e-4b30-95c2-3470042027e3",
      "0f3d4955-cf79-4cff-afdf-33de9d38728a",
      "5df6e380-1c64-424c-9d28-10f608332441",
      "fc97db37-53df-4031-9d62-2abaf4842259",
      "58f16842-9e8c-4ff0-bcac-3e9eaf237933",
      "6477d4b1-89b5-4405-9410-f6d880abed38",
      "b8c38802-7bb9-405e-a852-0c17d5c09c9b",
      "f67bc8ee-deff-4d57-ac14-060473b084ab",
      "f473ac7c-1941-4edd-b04b-0580f962e6db",
      "8b2324a1-931c-4061-81d7-f759f1653001",
      "ae435cd3-fab6-4d40-8218-55bc61d6d8c3",
      "15b51a11-a19c-420f-b0ac-c4e9be2f5e07",
      "0f5fb56c-60ab-479c-88b8-ec9e9d2e9281",
      "4bd87033-015a-415c-ab9c-eae720bbfcfe",
      "83b5fa87-bb66-469c-9e79-183936d59958",
      "0e503771-5527-4ec4-a4db-352e6124ab42",
      "5bbd3482-400a-4860-8e47-2bcc42ac9c49",
      "220ee7b1-cca4-4af8-838a-2001cb42b813",
      "c4e04f2e-bbf5-4e31-917b-8bfa7c4aa3aa",
      "d3716390-ce5b-4c26-b82e-e45ea7eba258",
      "f382ec3f-089d-46de-b921-b92adfd3327a",
      "5ecf9c15-d477-420b-badf-058537489524",
      "89710917-9352-450d-b96e-356403fc16e0",
      "3b0ae076-9a85-4090-af55-d9f6c9463b2b",
      "a4ba4078-e9e2-4d16-a834-02efe22992e2",
      "d057e7b7-69d3-4c15-bef3-b300f9fb7e31",
    ];

    // Claim All Task
    // await this.claimTaskAll("39391eb2-f031-4954-bd8a-e7aecbb1f192"); // this task need connet wallet
    const claimTask = [
      "6af85c01-f68d-4311-b78a-9cf33ba5b151",
      "38f6dd88-57bd-4b42-8712-286a06dac0a0",
      "d95d3299-e035-4bf6-a7ca-0f71578e9197",
      "57761ac3-0745-4cd2-be8b-e4231dfc92b5",
      "2140351e-b0d2-465e-adab-949d1735dc6e",
      "817dbad3-3290-4dc3-aa99-846d5f09d46d",
      "34c97e43-3e25-4240-834a-54e34029ca7a",
      "cb22f8ec-cc2f-49cb-8eb9-add09fad3682",
      "c7432e39-73b4-4cea-9740-f820b11d9da3",
      "33ddee08-2ef4-45ef-b243-8d80c6b32009",
      "3f1502b8-9e87-4b3a-995d-81c135f29f27",
      "1e5faaca-6d17-4f3b-96aa-537a112c1e68",
      "97d50b4c-a070-4136-a41d-390e67b883e0",
      "7ec46833-c5bf-4320-827e-fb04ab740972",
      "4098fa89-3b83-42d6-a987-a9b8a6f40caf",
      "d7accab9-f987-44fc-a70b-e414004e8314",
      "ec566e12-4e18-470a-b425-0242cd7c34d7",
      "760af0c6-f54b-41cc-b566-c51cfeb1e113",
      "a4bebdf8-3014-4c09-9e37-b4d12a183dc1",
      "53044aaf-a51f-4dfc-851a-ae2699a5f729",
      "e075353e-78b0-4204-b713-ae8c6860d688",
      "85f4eaf3-2200-4adf-8fea-c32362319919",
      "ede0f7f9-1dc2-43ae-8a09-5a8f5834ddae",
      "88ac35ee-8c40-4d0d-b310-23e303ada27d",
      "d92d0461-25c4-452f-9c32-a35511316332",
      "c86fa64a-0b63-4deb-84f0-5bfa42c6b47f",
      "ee08bcdb-c297-459e-90b2-0e0a4be1f2d0",
      "bbdd58fd-aa96-487a-b00f-faec45c545c3",
      "16dbcd76-a9a8-4123-967d-a7a0fcd099e8",
      "7c479ea4-110b-4bc0-9e15-a769d6170e84",
      "f0e4827d-f0a6-431e-a8f9-fa74ced77458",
      "84d1a1bc-a914-44c6-bcc0-593d8cbc476b",
      "94640066-4240-466b-8b7c-663ca525878c",
      "24c2fe53-f381-4382-abc8-b5792f8080e7",
      "53044aaf-a51f-4dfc-851a-ae2699a5f729",
      "f7f85b56-3310-4580-be47-7909203206d7",
      "f83c525c-9844-469b-a104-817814f337e7",
      "e05bb747-7d40-4b69-8b99-0f4a9a9305cf",
      "7b1b11eb-ec1e-4677-96b8-1b590b55dcf1",
      "aace23fe-0938-41ee-a77d-f89bee549928",
      "24dd6940-3529-40a4-89e9-cd806bc42708",
      "f542f997-59c1-498c-8612-c58faf4879ac",
      "90acc5fb-a505-4003-9344-9ec7539d23e1",
      "8e2c1d3b-8a33-4dbc-82e1-685b65173150",
      "ee7f9854-7ad7-4d95-9e4a-0ffb4210b0fa",
      "dafe118b-2602-43e7-a489-ebe50ca6ed0d",
      "d478fff3-945e-4b30-95c2-3470042027e3",
      "0f3d4955-cf79-4cff-afdf-33de9d38728a",
      "5df6e380-1c64-424c-9d28-10f608332441",
      "fc97db37-53df-4031-9d62-2abaf4842259",
      "58f16842-9e8c-4ff0-bcac-3e9eaf237933",
      "6477d4b1-89b5-4405-9410-f6d880abed38",
      "b8c38802-7bb9-405e-a852-0c17d5c09c9b",
      "f67bc8ee-deff-4d57-ac14-060473b084ab",
      "f473ac7c-1941-4edd-b04b-0580f962e6db",
      "8b2324a1-931c-4061-81d7-f759f1653001",
      "ae435cd3-fab6-4d40-8218-55bc61d6d8c3",
      "15b51a11-a19c-420f-b0ac-c4e9be2f5e07",
      "0f5fb56c-60ab-479c-88b8-ec9e9d2e9281",
      "4bd87033-015a-415c-ab9c-eae720bbfcfe",
      "83b5fa87-bb66-469c-9e79-183936d59958",
      "0e503771-5527-4ec4-a4db-352e6124ab42",
      "5bbd3482-400a-4860-8e47-2bcc42ac9c49",
      "220ee7b1-cca4-4af8-838a-2001cb42b813",
      "c4e04f2e-bbf5-4e31-917b-8bfa7c4aa3aa",
      "d3716390-ce5b-4c26-b82e-e45ea7eba258",
      "f382ec3f-089d-46de-b921-b92adfd3327a",
      "5ecf9c15-d477-420b-badf-058537489524",
      "89710917-9352-450d-b96e-356403fc16e0",
      "3b0ae076-9a85-4090-af55-d9f6c9463b2b",
      "a4ba4078-e9e2-4d16-a834-02efe22992e2",
      "d057e7b7-69d3-4c15-bef3-b300f9fb7e31",
    ];

    if (!isCompleted) {
      for (const taskId of noAnswerTasks) {
        await this.taskNoAnswer(taskId);
      }

      await this.randomDelay();

      for (const taskId of claimTask) {
        await this.claimTaskAll(taskId);
      }

      isCompleted = true;

      await this.log("One Time Success", "INFO");
    }

    // Always perform tasks without asking
    const taskListResponse = await this.getTasks();
    if (Array.isArray(taskListResponse) && taskListResponse.length > 0) {
      let allTasks = taskListResponse.flatMap((section) => section.tasks || []);

      allTasks = allTasks.filter(
        (task) => !this.excludedTasks.includes(task.id)
      );

      for (const task of allTasks) {
        if (task.status === "NOT_STARTED") {
          const startResult = await this.startTask(task.id);
          if (startResult) {
            const claimResult = await this.claimTask(task.id);
            if (claimResult && claimResult.status === "FINISHED") {
              await this.log(`Completed task ${task.title}`, "SUCCESS");
            } else {
              await this.log(`Failed to claim task: ${task.title}`, "WARNING");
            }
          }
        }
      }
    } else {
      await this.log(
        "Unable to get task list or task list is empty",
        "WARNING"
      );
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
      await this.log("Unable to check friend balance", "ERROR");
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
              "ERROR"
            );
            if (playAttempts < maxAttempts) {
              await this.log(`Retrying...`, "INFO");
              await this.Countdown(5);
            } else {
              await this.log(
                `Failed after ${maxAttempts} attempts, skipping this game`,
                "ERROR"
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

    const threadCountInput = await GameBot.askQuestion(
      `Enter the number of threads to use (1-${queryIds.length}): `
    );
    const threadCount = Math.min(
      Math.max(parseInt(threadCountInput) || 1, 1),
      queryIds.length
    );

    console.log(`Using ${threadCount} threads for processing.`.yellow);

    async function runWorker(queryId, threadNumber) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { queryId, threadNumber },
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
      console.log("Starting a new round of processing...".green);
      await processInBatches();
      console.log(
        "All accounts processed. Starting next round immediately.".green
      );
    }
  }

  main().catch(console.error);
} else {
  // This code will run in worker threads
  (async () => {
    const bot = new GameBot(workerData.threadNumber);
    const nextClaimTime = await bot.processAccount(workerData.queryId);

    if (nextClaimTime) {
      const now = DateTime.now();
      const waitTime = DateTime.fromMillis(nextClaimTime).diff(now);
      if (waitTime.milliseconds > 0) {
        await bot.log(`Next claim in ${waitTime.toFormat("hh:mm:ss")}`, "INFO");
        await new Promise((resolve) =>
          setTimeout(resolve, waitTime.milliseconds)
        );
      }
    }

    parentPort.postMessage("done");
  })();
}
