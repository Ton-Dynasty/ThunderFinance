import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { IBalance, MerkleTree, hashLeafNodes, packBalance, packProof } from '../utils/MerkleTree';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { JettonWallet } from '@ton/ton';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const factoryAddress = Address.parse('0QBTjxADbfKiuUKjEcB0x0dGsNB09Lt_Gunn4i4nJcRadInZ');
    const usdtAddress = Address.parse('kQB1jlLbl_nQE4Y-1-9_HT-8IZgiCn5u7uC3bVueOC6KJq6R');

    console.log('Sender address', provider.sender().address!!);

    // open factory contract
    const factory = provider.open(AirdropFactory.fromAddress(factoryAddress));
    const info = await factory.getMerkleDistributorInfo(provider.sender().address!!);
    console.log('Info', info.address, info.seed);

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
            value: toNano('0.05'),
        },
        {
            $$type: 'CreateAirdrop',
            airDropJettonWallet: distributorJettonWallet.address,
            merkleRoot: merkleRoot,
        },
    );
    await provider.waitForDeploy(factory.address);

    // transfer usdt to distributor
    const myJettonWallet = provider.open(await JettonWalletUSDT.fromInit(provider.sender().address!!, usdt.address));
    await myJettonWallet.send(
        provider.sender(),
        { value: toNano('0.5') },
        {
            $$type: 'JettonTransfer',
            query_id: BigInt(1),
            amount: BigInt(100 * 10 ** 6),
            destination: info.address,
            custom_payload: null,
            response_destination: provider.sender().address!!,
            forward_ton_amount: BigInt(0),
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
            value: toNano('0.5'),
        },
        {
            $$type: 'Claim',
            merkleProof: merkleProof,
            merkleProofSize: BigInt(hexProof.length),
            amount: BigInt(airdropList[1].amount),
        },
    );
}
