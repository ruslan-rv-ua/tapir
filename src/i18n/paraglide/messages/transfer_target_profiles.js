/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Transfer_Target_ProfilesInputs */

const uk_transfer_target_profiles = /** @type {(inputs: Transfer_Target_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Цільові профілі`)
};

const en_transfer_target_profiles = /** @type {(inputs: Transfer_Target_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Target profiles`)
};

/**
* | output |
* | --- |
* | "Target profiles" |
*
* @param {Transfer_Target_ProfilesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const transfer_target_profiles = /** @type {((inputs?: Transfer_Target_ProfilesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Transfer_Target_ProfilesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_transfer_target_profiles(inputs)
	return en_transfer_target_profiles(inputs)
});