/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ attempt: NonNullable<unknown> }} Status_Reconnecting_Attempt_UnlimitedInputs */

const uk_status_reconnecting_attempt_unlimited = /** @type {(inputs: Status_Reconnecting_Attempt_UnlimitedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Спроба ${i?.attempt}`)
};

const en_status_reconnecting_attempt_unlimited = /** @type {(inputs: Status_Reconnecting_Attempt_UnlimitedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Attempt ${i?.attempt}`)
};

/**
* | output |
* | --- |
* | "Attempt {attempt}" |
*
* @param {Status_Reconnecting_Attempt_UnlimitedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_reconnecting_attempt_unlimited = /** @type {((inputs: Status_Reconnecting_Attempt_UnlimitedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_Reconnecting_Attempt_UnlimitedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_reconnecting_attempt_unlimited(inputs)
	return en_status_reconnecting_attempt_unlimited(inputs)
});