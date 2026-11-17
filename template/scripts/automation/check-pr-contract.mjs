import process from "node:process";
import {
  implementationMergeCommits,
  localVerificationWarnings,
  readPrContractFromEnv,
  validateImplementationBranchHistory,
  validatePrContract,
} from "./pr-contract-lib.mjs";

try {
  const contract = readPrContractFromEnv();

  if (!contract.headRef && !contract.baseRef) {
    console.log("pr:verify skipped outside pull_request context.");
    process.exit(0);
  }

  for (const warning of localVerificationWarnings(contract.body)) {
    console.warn(`${process.env.GITHUB_ACTIONS === "true" ? "::warning::" : ""}pr:verify: ${warning}`);
  }

  const findings = [
    ...validatePrContract(contract),
    ...validateImplementationBranchHistory({
      ...contract,
      mergeCommits: implementationMergeCommits(contract),
    }),
  ];

  if (findings.length > 0) {
    console.error(`pr:verify failed with ${findings.length} issue(s).`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log(`pr:verify passed for ${contract.headRef} -> ${contract.baseRef}.`);
} catch (error) {
  console.error("pr:verify failed with an unexpected error.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
