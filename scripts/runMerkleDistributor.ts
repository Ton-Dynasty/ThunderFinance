import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { IBalance, MerkleTree, hashLeafNodes, packBalance, packProof } from '../utils/MerkleTree';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { loadDeployment, updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployInfo = await loadDeployment();
    const factoryAddress = Address.parse(deployInfo.AirdropFactory);
    const usdtAddress = Address.parse(deployInfo.USDT);

    console.log('Sender address', provider.sender().address!!);

    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 128).endCell().hash().toString('hex')}`);

    // open factory contract
    const factory = provider.open(AirdropFactory.fromAddress(factoryAddress));
    const info = await factory.getMerkleDistributorInfo(provider.sender().address!!, seed);

    const usdt = provider.open(JettonMasterUSDT.fromAddress(usdtAddress));

    // calculate fake usdt wallet address for deployed airdrop
    await sleep(1000);
    const distributorJettonWallet = await JettonWalletUSDT.fromInit(info.address, usdt.address);
    const airdropList: IBalance[] = [
        { account: Address.parse('0QC8zFHM8LCMp9Xs--w3g9wmf7RwuDgJcQtV-oHZRSCqQXmw'), amount: BigInt(50 * 10 ** 6) },
        { account: provider.sender().address!!, amount: BigInt(60 * 10 ** 6) },
        { account: Address.parse('0QDrRQlKRo5J10a-nUb8UQ7f3ueVYBQVZV9X8uAjmS7gH1Gy'), amount: BigInt(100 * 10 ** 6) },
    ];
    const nodes = hashLeafNodes(airdropList);
    const merkleTree = new MerkleTree(nodes);
    const merkleRoot = BigInt(`0x${merkleTree.getRoot().toString('hex')}`);

    // deploy airdrop
    await factory.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        {
            $$type: 'CreateAirdropPrivate',
            airDropJettonWallet: distributorJettonWallet.address,
            merkleRoot: merkleRoot,
            seed: seed,
            metadataUri: beginCell().storeStringTail('https://example.com').endCell(),
        },
    );
    await provider.waitForDeploy(factory.address);

    if (await provider.isContractDeployed(info.address)) {
        await updateDeployment('MerkleDistributor', info.address.toString());
    }

    // mint usdt (uncomment if needed)
    // await usdt.send(
    //     provider.sender(),
    //     {
    //         value: toNano('1'),
    //     },
    //     'Mint:1',
    // );

    // transfer usdt to distributor
    const myJettonWallet = provider.open(await JettonWalletUSDT.fromInit(provider.sender().address!!, usdt.address));
    await myJettonWallet.send(
        provider.sender(),
        { value: toNano('1') },
        {
            $$type: 'JettonTransfer',
            query_id: BigInt(1),
            amount: airdropList.reduce((acc, item) => acc + item.amount, 0n),
            destination: info.address,
            custom_payload: null,
            response_destination: provider.sender().address!!,
            forward_ton_amount: toNano('0.1'),
            forward_payload: beginCell().endCell(),
        },
    );

    // get proof for this sender
    const balance = packBalance(airdropList[1]);
    const hexProof = merkleTree.getHexProof(balance);
    const merkleProof = packProof(hexProof);

    // get airdrop
    const distributor = provider.open(MerkleDistributor.fromAddress(info.address));
    await distributor.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        {
            $$type: 'Claim',
            merkleProof: merkleProof,
            merkleProofSize: BigInt(hexProof.length),
            amount: BigInt(airdropList[1].amount),
        },
    );
}
