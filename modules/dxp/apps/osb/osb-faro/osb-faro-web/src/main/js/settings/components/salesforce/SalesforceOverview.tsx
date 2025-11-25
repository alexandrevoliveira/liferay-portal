import * as breadcrumbs from 'shared/util/breadcrumbs';
import BasePage from 'settings/components/base-page/BasePage';
import ClayAlert, {DisplayType} from '@clayui/alert';
import ClayButton from '@clayui/button';
import ClayIcon from '@clayui/icon';
import ClayLabel from '@clayui/label';
import ClayLink from '@clayui/link';
import InputWithEditToggle from 'shared/components/InputWithEditToggle';
import Loading from 'shared/components/Loading';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import SalesforceAccountsAndIndividuals from './SalesforceAccountsAndIndividuals';
import URLConstants from 'shared/util/url-constants';
import {addAlert} from '../../../shared/actions/alerts';
import {Alert} from 'shared/types';
import {Card} from 'shared/components/revamping/Card';
import {ClayInput} from '@clayui/form';
import {close, modalTypes, open} from 'shared/actions/modals';
import {connect, ConnectedProps} from 'react-redux';
import {ConnectSalesforceAuth} from './ConnectSalesforceAuth';
import {DataSource} from 'shared/util/records';
import {DataSourceStatuses} from 'shared/util/constants';
import {
	disconnect,
	fetch,
	fetchAccountsCount,
	fetchUserCount,
	updateSalesforce
} from 'shared/api/data-source';
import {
	getDataSourceDisplayObject,
	validateUniqueName
} from 'shared/util/data-sources';
import {sequence} from 'shared/util/promise';
import {Text} from '@clayui/core';
import {
	toPromise,
	validateMaxLength,
	validateRequired
} from 'shared/components/form';
import {useCurrentUser} from 'shared/hooks/useCurrentUser';
import {useParams} from 'react-router-dom';
import {useRequest} from 'shared/hooks/useRequest';

const connector = connect(null, {
	addAlert,
	close,
	open
});

type PropsFromRedux = ConnectedProps<typeof connector>;

interface ISalesforceOverviewProps extends PropsFromRedux {
	dataSource: DataSource;
}

const SalesforceOverview: React.FC<ISalesforceOverviewProps> = ({
	addAlert,
	close,
	dataSource: initialDataSource,
	open
}) => {
	const [loading, setLoading] = useState(false);
	const [dataSource, setDataSource] = useState(initialDataSource);

	const {groupId, id} = useParams();
	const currentUser = useCurrentUser();

	type Alert = {
		displayType: DisplayType;
		message: string;
	};

	const initialAlert: Alert = {
		displayType: 'success',
		message: ''
	};

	const [alert, setAlert] = useState(initialAlert);

	const dataSourceActive = dataSource.status === DataSourceStatuses.Active;

	const enabledAllAccounts = dataSource.provider.getIn(
		['accountsConfiguration', 'enableAllAccounts'],
		false
	);

	const enabledAllContacts = dataSource.provider.getIn(
		['contactsConfiguration', 'enableAllContacts'],
		false
	);

	const enableAllLeads = dataSource.provider.getIn(
		['contactsConfiguration', 'enableAllLeads'],
		false
	);

	const updateDataSource = async (dataSource: any) => {
		try {
			setLoading(true);

			await updateSalesforce(dataSource);

			const newDataSource = await fetch({
				groupId,
				id
			});

			setDataSource(new DataSource(newDataSource));
		} catch (error) {
			addAlert({
				alertType: Alert.Types.Error,
				message: Liferay.Language.get(
					'there-was-an-error-processing-your-request.-try-again.-if-the-problem-persists,-please-contact-support'
				)
			});
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const alert: Alert = {
			displayType: 'success',
			message: Liferay.Language.get(
				'you-have-successfully-authenticated-your-token-with-liferay-analytics-cloud.-you-can-now-select-the-data-to-sync'
			)
		};

		if (!dataSourceActive) {
			alert.displayType = 'warning';

			alert.message = Liferay.Language.get(
				'the-data-source-is-disconnected.-data-is-no-longer-being-synced-from-dxp,-but-you-can-reconnect-to-resume-syncing'
			);
		} else if (enabledAllAccounts || enabledAllContacts || enableAllLeads) {
			alert.message = Liferay.Language.get(
				'all-data-coming-from-this-data-source-is-up-to-date.-there-are-no-errors-to-report'
			);
		}

		setAlert(alert);
	}, [
		dataSourceActive,
		enableAllLeads,
		enabledAllAccounts,
		enabledAllContacts
	]);

	const cachedNameValues = useRef(new Map());

	const handleDisconnectClick = useCallback(() => {
		open(modalTypes.CONFIRMATION_MODAL, {
			message: (
				<Text as='p' size={4}>
					{Liferay.Language.get(
						'this-action-will-stop-syncing-data-from-salesforce-to-this-analytics-cloud-workspace.-the-data-that-was-already-synced-will-remain-available-in-the-properties-the-data-source-was-connected-to.-are-you-sure-you-want-to-continue'
					)}
				</Text>
			),
			modalVariant: 'modal-warning',
			onClose: close,
			onSubmit: async () => {
				try {
					await disconnect({groupId, id});

					const dataSource = await fetch({
						groupId,
						id
					});

					setDataSource(new DataSource(dataSource));

					addAlert({
						alertType: Alert.Types.Success,
						message: Liferay.Language.get(
							'data-source-disconnected'
						)
					});

					close();
				} catch (error) {
					addAlert({
						alertType: Alert.Types.Error,
						message: Liferay.Language.get(
							'there-was-an-error-processing-your-request.-try-again.-if-the-problem-persists,-please-contact-support'
						)
					});
				}
			},
			submitButtonDisplay: 'warning',
			submitMessage: Liferay.Language.get('disconnect'),
			title: Liferay.Language.get('disconnect-data-source'),
			titleIcon: 'warning-full'
		});
	}, [addAlert, close, groupId, id, open]);

	const handleUpdateName = useCallback(
		async name => {
			await updateDataSource({groupId, id, name});
		},
		[groupId, id]
	);

	const handleValidate = useCallback(
		value => {
			let error = null;

			if (value !== dataSource.name) {
				if (cachedNameValues.current.has(value)) {
					error = cachedNameValues.current.get(value);
				} else {
					error = validateUniqueName({groupId, value});

					cachedNameValues.current.set(value, error);
				}
			}

			return toPromise(error);
		},
		[dataSource.name, groupId]
	);

	const {display, label} = getDataSourceDisplayObject(dataSource, true);

	const accountsCountResponse = useRequest({
		dataSourceFn: fetchAccountsCount,
		variables: {groupId, id: dataSource.id}
	});

	const userCountResponse = useRequest({
		dataSourceFn: fetchUserCount,
		variables: {groupId, id: dataSource.id}
	});

	useEffect(() => {
		if (accountsCountResponse.error || userCountResponse.error) {
			addAlert({
				alertType: Alert.Types.Error,
				message: Liferay.Language.get(
					'there-was-an-error-processing-your-request.-try-again.-if-the-problem-persists,-please-contact-support'
				)
			});
		}
	}, [accountsCountResponse.error, userCountResponse.error]);

	return (
		<BasePage
			breadcrumbItems={[
				breadcrumbs.getDataSources({groupId}),
				breadcrumbs.getDataSourceName({
					active: true,
					label: dataSource.name
				})
			]}
			documentTitle={Liferay.Language.get('configure-data-source')}
		>
			<div className='mb-5'>
				<ClayLabel className='mb-2' displayType={display as any}>
					{label}
				</ClayLabel>

				<InputWithEditToggle
					editable={currentUser?.isAdmin()}
					inputWidth={30}
					name='dataSourceName'
					onSubmit={name => toPromise(handleUpdateName(name))}
					required
					validate={sequence([
						validateRequired,
						validateMaxLength(75),
						handleValidate
					])}
					value={dataSource.name || ''}
				/>
			</div>

			<Card title={Liferay.Language.get('authentication')}>
				<div className='mb-4'>
					<Card.SubHeader
						title={Liferay.Language.get('connection-status')}
					/>

					{alert && (
						<ClayAlert displayType={alert.displayType}>
							{alert.message}
						</ClayAlert>
					)}

					{!dataSourceActive && (
						<>
							<div className='mb-3'>
								<Text color='secondary' size={4}>
									{Liferay.Language.get(
										'to-reestablish-the-connection-between-salesforce-and-liferay-analytics-cloud,-generate-a-token-and-paste-the-code-on-the-input-below'
									)}
								</Text>

								<ClayLink
									className='ml-1'
									href={URLConstants.HelpConnectDxp}
									key='DOCUMENTATION'
									target='_blank'
								>
									{Liferay.Language.get(
										'learn-more-about-data-sources'
									)}
								</ClayLink>
							</div>

							<ConnectSalesforceAuth
								addAlert={
									(addAlert as unknown) as Alert.AddAlert
								}
								buttonProps={{size: 'sm'}}
								dataSource={dataSource}
								onSubmit={async dataSource => {
									await updateDataSource(dataSource);
								}}
							/>
						</>
					)}
				</div>

				<div className='mb-4'>
					<Card.SubHeader
						title={Liferay.Language.get('data-source-details')}
					/>

					<ClayInput.Group className='d-flex mt-3'>
						<ClayInput.GroupItem className='mr-3' shrink>
							<label htmlFor='dataSourceType'>
								{Liferay.Language.get('data-source-type')}
							</label>

							<ClayInput
								readOnly
								type='text'
								value={Liferay.Language.get('salesforce')}
							/>
						</ClayInput.GroupItem>

						<ClayInput.GroupItem className='ml-0' shrink>
							<label htmlFor='dataSourceId'>
								{Liferay.Language.get('data-source-id')}
							</label>

							<ClayInput
								readOnly
								type='text'
								value={dataSource.id}
							/>
						</ClayInput.GroupItem>
					</ClayInput.Group>
				</div>

				{dataSourceActive && (
					<ClayButton
						aria-label={Liferay.Language.get(
							'disconnect-data-source'
						)}
						displayType='danger'
						onClick={handleDisconnectClick}
						outline
						size='sm'
					>
						<ClayIcon className='mr-2' symbol='logout' />

						{Liferay.Language.get('disconnect-data-source')}
					</ClayButton>
				)}
			</Card>

			<Card title={Liferay.Language.get('synced-data')}>
				{dataSourceActive &&
					!enabledAllAccounts &&
					(!enabledAllContacts || !enableAllLeads) && (
						<ClayAlert displayType='warning' title='Warning'>
							{Liferay.Language.get(
								'the-data-source-setup-is-almost-complete.-sync-data-to-start-seeing-results-as-activities-occur-on-your-sites'
							)}
						</ClayAlert>
					)}

				<div className='mb-2'>
					<Text color='secondary' size={4}>
						{Liferay.Language.get(
							'to-configure-your-salesforce-data-source,-go-to-your-salesforce-environment-to-update-this-app-connection'
						)}
					</Text>
				</div>

				{accountsCountResponse.loading || userCountResponse.loading ? (
					<Loading spacer />
				) : (
					<SalesforceAccountsAndIndividuals
						accountsSyncedCount={accountsCountResponse.data}
						disabled={!dataSourceActive || !currentUser.isAdmin()}
						enabledAccount={enabledAllAccounts}
						enabledIndividual={enabledAllContacts || enableAllLeads}
						individualsSyncedCount={userCountResponse.data}
						loading={loading}
						onAccountChange={async () => {
							await updateDataSource({
								accountsConfiguration: {
									enableAllAccounts: !enabledAllAccounts
								},
								groupId,
								id: dataSource.id
							});
						}}
						onIndividualChange={async () => {
							await updateDataSource({
								contactsConfiguration: {
									enableAllContacts: !enabledAllContacts,
									enableAllLeads: !enableAllLeads
								},
								groupId,
								id: dataSource.id
							});
						}}
					/>
				)}
			</Card>
		</BasePage>
	);
};

export default connector(SalesforceOverview);
