/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_SwitchInputs */

const uk_profile_switch = /** @type {(inputs: Profile_SwitchInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перемкнутися`)
};

const en_profile_switch = /** @type {(inputs: Profile_SwitchInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Switch`)
};

/**
* | output |
* | --- |
* | "Switch" |
*
* @param {Profile_SwitchInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_switch = /** @type {((inputs?: Profile_SwitchInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_SwitchInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_switch(inputs)
	return en_profile_switch(inputs)
});