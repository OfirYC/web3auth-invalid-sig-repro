import { useEffect, useState } from "react";
import {
  Web3AuthMPCCoreKit,
  WEB3AUTH_NETWORK,
  Point,
  SubVerifierDetailsParams,
  TssShareType,
  keyToMnemonic,
  getWebBrowserFactor,
  COREKIT_STATUS,
  TssSecurityQuestion,
  generateFactorKey,
} from "@web3auth/mpc-core-kit";
import Web3 from "web3";
import {
  HttpProvider,
  AbstractProvider,
  IpcProvider,
  WebsocketProvider,
} from "web3-core/types";

import { Signer, providers } from "ethers";
import "./App.css";
import { SafeEventEmitterProvider } from "@web3auth/base";
import { BN } from "bn.js";
import {
  formatUnits,
  hashMessage,
  parseEther,
  parseUnits,
  recoverAddress,
} from "ethers/lib/utils";

const uiConsole = (...args: any[]): void => {
  const el = document.querySelector("#console>p");
  if (el) {
    el.innerHTML = JSON.stringify(args || {}, null, 2);
  }
  console.log(...args);
};

const selectedNetwork = WEB3AUTH_NETWORK.MAINNET;

const coreKitInstance = new Web3AuthMPCCoreKit({
  web3AuthClientId:
    "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ",
  web3AuthNetwork: selectedNetwork,
  uxMode: "popup",
});

function App() {
  const [backupFactorKey, setBackupFactorKey] = useState<string | undefined>(
    undefined
  );
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(
    null
  );

  const [jsonRpcProvider, setJsonRpcProvider] =
    useState<providers.Web3Provider>();

  const [web3, setWeb3] = useState<Web3>();

  const [exportTssShareType, setExportTssShareType] = useState<TssShareType>(
    TssShareType.DEVICE
  );
  const [factorPubToDelete, setFactorPubToDelete] = useState<string>("");

  const [coreKitStatus, setCoreKitStatus] = useState<COREKIT_STATUS>(
    COREKIT_STATUS.NOT_INITIALIZED
  );
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  const [newAnswer, setNewAnswer] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState<string | undefined>(undefined);
  const [newQuestion, setNewQuestion] = useState<string | undefined>(undefined);

  const securityQuestion: TssSecurityQuestion = new TssSecurityQuestion();

  useEffect(() => {
    const init = async () => {
      await coreKitInstance.init();

      if (coreKitInstance.provider) {
        setProvider(coreKitInstance.provider);
      }

      setCoreKitStatus(coreKitInstance.status);
    };
    init();
  }, []);

  useEffect(() => {
    if (provider) {
      const rpc = new providers.Web3Provider(provider);
      setJsonRpcProvider(rpc);

      const web3 = new Web3(provider as any);
      setWeb3(web3);
    }
  }, [provider]);

  const keyDetails = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    uiConsole(coreKitInstance.getKeyDetails());
  };

  const listFactors = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    const factorPubs = coreKitInstance.tKey.metadata.factorPubs;
    if (!factorPubs) {
      throw new Error("factorPubs not found");
    }
    const pubsHex = factorPubs[coreKitInstance.tKey.tssTag].map((pub: any) => {
      return Point.fromTkeyPoint(pub).toBufferSEC1(true).toString("hex");
    });
    uiConsole(pubsHex);
  };

  const login = async () => {
    try {
      if (!coreKitInstance) {
        throw new Error("initiated to login");
      }
      const verifierConfig = {
        subVerifierDetails: {
          typeOfLogin: "google",
          verifier: "w3a-google-demo",
          clientId:
            "519228911939-cri01h55lsjbsia1k7ll6qpalrus75ps.apps.googleusercontent.com",
        },
      } as SubVerifierDetailsParams;

      await coreKitInstance.loginWithOauth(verifierConfig);

      try {
        let result = securityQuestion.getQuestion(coreKitInstance!);
        setQuestion(result);
      } catch (e) {
        setQuestion(undefined);
        uiConsole(e);
      }

      if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
        uiConsole(
          "required more shares, please enter your backup/ device factor key, or reset account unrecoverable once reset, please use it with caution]"
        );
      }

      if (coreKitInstance.provider) {
        setProvider(coreKitInstance.provider);
      }

      setCoreKitStatus(coreKitInstance.status);
    } catch (error: unknown) {
      uiConsole(error);
    }
  };

  const getDeviceShare = async () => {
    const factorKey = await getWebBrowserFactor(coreKitInstance!);
    setBackupFactorKey(factorKey);
    uiConsole("Device share: ", factorKey);
  };

  const inputBackupFactorKey = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!backupFactorKey) {
      throw new Error("backupFactorKey not found");
    }
    const factorKey = new BN(backupFactorKey, "hex");
    await coreKitInstance.inputFactorKey(factorKey);

    if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
      uiConsole(
        "required more shares even after inputing backup factor key, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"
      );
    }

    if (coreKitInstance.provider) {
      setProvider(coreKitInstance.provider);
    }
  };

  const recoverSecurityQuestionFactor = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!answer) {
      throw new Error("backupFactorKey not found");
    }

    let factorKey = await securityQuestion.recoverFactor(
      coreKitInstance,
      answer
    );
    setBackupFactorKey(factorKey);
    uiConsole("Security Question share: ", factorKey);
  };

  const logout = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    await coreKitInstance.logout();
    uiConsole("Log out");
    setProvider(null);
  };

  const getUserInfo = (): void => {
    const user = coreKitInstance?.getUserInfo();
    uiConsole(user);
  };

  const exportFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    uiConsole("export share type: ", exportTssShareType);
    const factorKey = generateFactorKey();
    await coreKitInstance.createFactor({
      shareType: exportTssShareType,
      factorKey: factorKey.private,
    });
    uiConsole("Export factor key: ", factorKey);
  };

  const deleteFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const pubBuffer = Buffer.from(factorPubToDelete, "hex");
    const pub = Point.fromBufferSEC1(pubBuffer);
    await coreKitInstance.deleteFactor(pub.toTkeyPoint());
    uiConsole("factor deleted");
  };

  const getChainID = async () => {
    if (!jsonRpcProvider) {
      uiConsole("jsonRpcProvider not initialized yet");
      return;
    }
    const chainId = (await jsonRpcProvider.getNetwork()).chainId;
    uiConsole(chainId);
    return chainId;
  };

  const getAccounts = async () => {
    if (!jsonRpcProvider) {
      uiConsole("jsonRpcProvider not initialized yet");
      return;
    }
    const address = await jsonRpcProvider.getSigner().getAddress();

    if (!address) throw "no address";
    uiConsole(address);

    return address;
  };

  const getBalance = async () => {
    if (!jsonRpcProvider) {
      uiConsole("jsonRpcProvider not initialized yet");
      return;
    }
    const address = await getAccounts();
    const balance = formatUnits(
      await jsonRpcProvider.getBalance(address as string) // Balance is in wei
    );
    uiConsole(balance);
    return balance;
  };

  const criticalResetAccount = async (): Promise<void> => {
    // This is a critical function that should only be used for testing purposes
    // Resetting your account means clearing all the metadata associated with it from the metadata server
    // The key details will be deleted from our server and you will not be able to recover your account
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    //@ts-ignore
    // if (selectedNetwork === WEB3AUTH_NETWORK.MAINNET) {
    //   throw new Error("reset account is not recommended on mainnet");
    // }
    await coreKitInstance.tKey.storageLayer.setMetadata({
      privKey: new BN(coreKitInstance.metadataKey!, "hex"),
      input: { message: "KEY_NOT_FOUND" },
    });
    uiConsole("reset");
    setProvider(null);
  };

  const createSecurityQuestion = async (question: string, answer: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.setSecurityQuestion({
      mpcCoreKit: coreKitInstance,
      question,
      answer,
      shareType: TssShareType.RECOVERY,
    });
    setNewQuestion(undefined);
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
  };

  const changeSecurityQuestion = async (
    newQuestion: string,
    newAnswer: string,
    answer: string
  ) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.changeSecurityQuestion({
      mpcCoreKit: coreKitInstance,
      newQuestion,
      newAnswer,
      answer,
    });
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
  };

  const deleteSecurityQuestion = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.deleteSecurityQuestion(coreKitInstance);
    setQuestion(undefined);
  };

  const enableMFA = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const factorKey = await coreKitInstance.enableMFA({});
    const factorKeyMnemonic = keyToMnemonic(factorKey);

    uiConsole(
      "MFA enabled, device factor stored in local store, deleted hashed cloud key, your backup factor key: ",
      factorKeyMnemonic
    );
  };

  const loggedInView = (
    <>
      <h2 className="subtitle">Account Details</h2>
      <div
        className="flex-container"
        style={{
          width: "20vw",
          paddingBottom: "2vw",
        }}
      >
        <button
          onClick={async () => {
            if (!jsonRpcProvider) throw "No Provider";

            if (!web3) throw "No Web3";

            const signer = jsonRpcProvider.getSigner();

            const signerAddress = await signer.getAddress();

            uiConsole("Expected Signer:", signerAddress);

            const signatures: any[][] = [];

            for (let i = 0; i < 50; i++) {
              const [isValid, signature, recoveredAddress] =
                await checkWeb3AuthValidity(signer, signerAddress);

              const validityString =
                `Retry ${i + 1}/50 is ${isValid ? "Valid" : "Invalid"}  
                ` +
                `
                Success: ${isValid}
                Signature: ${signature}
                Recovered Address: ${recoveredAddress}
                Expected Address: ${signerAddress}
                `;

              uiConsole(
                `Retry ${i + 1}/50 is ${isValid ? "Valid" : "Invalid"}`,
                `Success: ${isValid}`,
                `Signature: ${signature}`,
                `Recovered Address: ${recoveredAddress}`,
                `Expected Address: ${signerAddress}`
              );

              signatures.push([signature, isValid]);
            }

            uiConsole(
              "Signatures Successes:",
              signatures,
              signerAddress,
              await signer.getAddress()
            );

            uiConsole(
              `Success Rate: ${
                100 / (100 / signatures.filter(([isValid]) => isValid).length)
              }%`
            );
          }}
          className="card"
          style={{
            width: "100%",
            height: "10vh",
            fontSize: "22px",
          }}
        >
          Test Signatures Stability
        </button>
      </div>
    </>
  );

  const unloggedInView = (
    <>
      <button onClick={() => login()} className="card">
        Login
      </button>
      <div
        className={
          coreKitStatus === COREKIT_STATUS.REQUIRED_SHARE ? "" : "disabledDiv"
        }
      >
        <button onClick={() => getDeviceShare()} className="card">
          Get Device Share
        </button>
        <label>Backup/ Device factor key:</label>
        <input
          value={backupFactorKey}
          onChange={(e) => setBackupFactorKey(e.target.value)}
        ></input>
        <button onClick={() => inputBackupFactorKey()} className="card">
          Input Factor Key
        </button>
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>

        <div className={!question ? "disabledDiv" : ""}>
          <label>Recover Using Security Answer:</label>
          <label>{question}</label>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          ></input>
          <button
            onClick={() => recoverSecurityQuestionFactor()}
            className="card"
          >
            Recover Using Security Answer
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="container">
      <h1 className="title">
        <a
          target="_blank"
          href="https://web3auth.io/docs/guides/mpc"
          rel="noreferrer"
        >
          Web3Auth MPC Core Kit
        </a>{" "}
        Popup Flow Example
      </h1>

      <div className="grid">{provider ? loggedInView : unloggedInView}</div>
      <div
        id="console"
        style={{
          border: "10px solid black",
          height: "100vh",
        }}
      >
        <p style={{ whiteSpace: "pre-line" }}></p>
      </div>

      <footer className="footer">
        <a
          href="https://github.com/Web3Auth/web3auth-core-kit-examples/tree/main/mpc-core-kit/mpc-core-kit-react-popup-example"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
      </footer>
    </div>
  );
}

export default App;

async function checkWeb3AuthValidity(signer: Signer, expectedAddress: string) {
  const message = "Hello World!";

  const signature = await signer.signMessage(message);

  const hashRecoverdAddress = recoverAddress(hashMessage(message), signature);

  const isValid = hashRecoverdAddress == expectedAddress;

  return [isValid, signature, hashRecoverdAddress];
}
