import { ethers } from 'ethers';
import config from '../../config';
import { utils } from 'ethers/lib';
import getProvider from '../provider';
import redis from '../redis';

async function callRNSContract<T>(method: string, ...args: any): Promise<T> {
    const provider = await getProvider(config.rns.test ? 'ropsten' : 'homestead');

    const contract = await new ethers.Contract(getRNSContract(), config.rns.contract.resolver, provider);
    return contract[method](...args);
}

function getRNSContract() {
    if (config.rns.test) {
        return config.rns.contractNetworks.ropsten.resolver;
    } else {
        return config.rns.contractNetworks.mainnet.resolver;
    }
}

// sha3HexAddress https://eips.ethereum.org/EIPS/eip-181
function sha3HexAddress(addr: string) {
    addr = '00' + addr.slice(2);
    const lookup = '3031323334353637383961626364656600000000000000000000000000000000';
    let res = '';
    for (let i = 40; i > 0; i--) {
        const bit = Number('0x' + addr.slice(i, i + 2)) & 0xf;
        res = lookup.slice(2 * bit, 2 * bit + 2) + res;
    }
    return utils.keccak256('0x' + res);
}

export default {
    async addr2Name(addr: string) {
        let name = await redis.get(`rns-addr2Name-${addr}`);
        if (name) {
            return name;
        } else {
            const reverseNode = '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2';
            const addrHex = sha3HexAddress(addr.toLowerCase());
            const node = utils.keccak256(utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], [reverseNode, addrHex]));
            name = (await callRNSContract<string>('name', node))
                .toLowerCase()
                .replace(new RegExp(`\\${config.rns.suffix}$`), '.rss3');
            if (name) {
                await redis.set(`rns-addr2Name-${addr}`, name);
                await redis.set(`rns-name2Addr-${name}`, addr);
                return name;
            }
        }
        return null;
    },
    async name2Addr(name: string) {
        let addr = await redis.get(`rns-name2Addr-${name}`);
        if (addr) {
            return addr;
        } else {
            const rnsInsideName = name.toLowerCase().replace(new RegExp(`\.rss3$`), config.rns.suffix);
            addr = await callRNSContract<string>('addr', utils.namehash(rnsInsideName));
            if (addr) {
                await redis.set(`rns-name2Addr-${name}`, addr);
                await redis.set(`rns-addr2Name-${addr}`, name);
                return addr;
            }
        }
        return null;
    },
};
