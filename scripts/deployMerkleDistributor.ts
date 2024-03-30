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
    console.log('Factory address', factory.address.toString());
    const info = await factory.getMerkleDistributorInfo(provider.sender().address!!, seed);
    console.log('MerkleDistributor address', info.address.toString());

    // open usdt contract
    const usdt = provider.open(JettonMasterUSDT.fromAddress(usdtAddress));
    console.log('USDT address', usdt.address.toString());

    // calculate fake usdt wallet address for deployed airdrop
    const distributorJWAddr = await usdt.getGetWalletAddress(info.address);
    console.log('Distributor JettonWallet address', distributorJWAddr.toString());
    const distributorJettonWallet = JettonWalletUSDT.fromAddress(distributorJWAddr);
    const airdropList: IBalance[] = [
        { account: Address.parse('0QC8zFHM8LCMp9Xs--w3g9wmf7RwuDgJcQtV-oHZRSCqQXmw'), amount: BigInt(20 * 10 ** 6) },
        { account: provider.sender().address!!, amount: BigInt(50 * 10 ** 6) },
        { account: Address.parse('0QDrRQlKRo5J10a-nUb8UQ7f3ueVYBQVZV9X8uAjmS7gH1Gy'), amount: BigInt(30 * 10 ** 6) },
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

    await provider.waitForDeploy(info.address);


    await updateDeployment('MerkleDistributor', {
        seed: seed.toString(),
        merkleNodes: merkleTree.nodes.map((item) => item.toString('hex')),
        address: info.address.toString(),
        airdropList: airdropList.map((item) => ({
            account: item.account.toString(),
            amount: item.amount.toString(),
        })),
        distributorJettonWallet: distributorJettonWallet.address.toString(),
    });
}
